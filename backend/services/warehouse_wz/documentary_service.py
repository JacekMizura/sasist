"""Documentary WZ after WMS pick finalize — no second inventory decrement."""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.pick import Pick
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.stock_operation import StockOperation
from ..activity_log.domain_activity import record_domain_activity
from ..activity_log.domain_event_codes import ORDER_WZ_DOCUMENTARY_CREATED
from ..document_number_service import (
    DocumentSeriesOperationalError,
    assign_series_number_to_stock_document,
    require_warehouse_series,
)
from ..order_reservations.rz_document_service import find_active_rz_document
from ..stock_document_service import compute_pz_line_financial_totals
from .constants import SETTLEMENT_WMS_PICK, wms_pick_finalize_idempotency_key

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DocumentaryWzResult:
    stock_document_id: int
    document_number: str
    created: bool


def load_wz_by_idempotency_key(
    db: Session,
    *,
    tenant_id: int,
    idempotency_key: str,
) -> StockDocument | None:
    key = str(idempotency_key or "").strip()
    if not key:
        return None
    return (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.idempotency_key == key,
            StockDocument.document_type == "WZ",
        )
        .first()
    )


def _aggregate_pick_lines(picks: list[Pick]) -> list[dict]:
    """Group finalized picks into WZ line payloads (product + location + lot)."""
    buckets: dict[tuple[int, int | None, int, str, date], float] = defaultdict(float)
    for p in picks:
        qty = float(p.quantity or 0)
        if qty <= 1e-12:
            continue
        bn = str(getattr(p, "batch_number", None) or "").strip()
        exp = getattr(p, "expiry_date", None) or date(9999, 12, 31)
        key = (int(p.product_id), int(p.order_item_id) if p.order_item_id else None, int(p.location_id), bn, exp)
        buckets[key] += qty
    out: list[dict] = []
    for (product_id, order_item_id, location_id, batch_number, expiry_date), qty in buckets.items():
        out.append(
            {
                "product_id": product_id,
                "order_item_id": order_item_id,
                "location_id": location_id,
                "batch_number": batch_number,
                "expiry_date": expiry_date,
                "quantity": round(float(qty), 6),
            }
        )
    return out


def create_documentary_wz_for_wms_pick_finalize(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    pick_ids: list[int],
    session_key: str | int,
    performed_by_user_id: int | None = None,
) -> DocumentaryWzResult | None:
    """
    Create completed documentary WZ for quantities finalized in this pick session.
    Idempotent per order + pick-finalize session. Never decrements inventory.
    """
    oid = int(order.id)
    idem = wms_pick_finalize_idempotency_key(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        session_key=session_key,
        order_id=oid,
    )
    existing = load_wz_by_idempotency_key(db, tenant_id=int(tenant_id), idempotency_key=idem)
    if existing is not None:
        return DocumentaryWzResult(
            stock_document_id=int(existing.id),
            document_number=str(getattr(existing, "document_number", None) or ""),
            created=False,
        )

    if not pick_ids:
        return None

    picks = (
        db.query(Pick)
        .filter(
            Pick.id.in_([int(x) for x in pick_ids]),
            Pick.order_id == oid,
            Pick.tenant_id == int(tenant_id),
        )
        .all()
    )
    line_payloads = _aggregate_pick_lines(picks)
    if not line_payloads:
        return None

    try:
        wz_series = require_warehouse_series(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            subtype="WZ",
        )
    except DocumentSeriesOperationalError:
        raise

    rz_doc = find_active_rz_document(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        order_id=oid,
    )
    rz_doc_id = int(rz_doc.id) if rz_doc is not None else None

    wz = StockDocument(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        document_type="WZ",
        creation_source="WMS",
        settlement_mode=SETTLEMENT_WMS_PICK,
        idempotency_key=idem,
        order_id=oid,
        source_rz_document_id=rz_doc_id,
        status="completed",
        currency=str(getattr(order, "currency", None) or "PLN"),
        created_by_user_id=int(performed_by_user_id) if performed_by_user_id else None,
    )
    db.add(wz)
    db.flush()

    wh_code = str(getattr(wz_series, "code", None) or "").strip() or None
    doc_number = assign_series_number_to_stock_document(db, wz, wz_series, warehouse_code=wh_code)

    wz_lines: list[StockDocumentItem] = []
    for lp in line_payloads:
        qty = float(lp["quantity"])
        line = StockDocumentItem(
            document_id=int(wz.id),
            product_id=int(lp["product_id"]),
            ordered_quantity=qty,
            received_quantity=qty,
            quantity=qty,
            mm_line_from_location_id=int(lp["location_id"]),
            batch_number=str(lp["batch_number"] or ""),
            expiry_date=lp["expiry_date"],
        )
        db.add(line)
        db.flush()
        wz_lines.append(line)

    total_net, _vat, total_gross = compute_pz_line_financial_totals(wz_lines)
    wz.total_net = total_net
    wz.total_gross = total_gross
    wz.receiving_status = "DONE"
    wz.putaway_status = "DONE"
    wz.relocation_status = "DONE"
    db.flush()

    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        event_type=ORDER_WZ_DOCUMENTARY_CREATED,
        description=(
            f"Utworzono dokument WZ {doc_number} dla zrealizowanego wydania magazynowego."
        ),
        order_id=oid,
        warehouse_id=int(warehouse_id),
        stock_document_id=int(wz.id),
        correlation_id=idem,
        metadata={
            "settlement_mode": SETTLEMENT_WMS_PICK,
            "pick_ids": [int(x) for x in pick_ids],
            "session_key": str(session_key),
            "source_rz_document_id": rz_doc_id,
        },
    )
    logger.info(
        "[warehouse_wz.documentary] wz_id=%s number=%s order_id=%s session=%s picks=%s",
        wz.id,
        doc_number,
        oid,
        session_key,
        len(pick_ids),
    )
    return DocumentaryWzResult(
        stock_document_id=int(wz.id),
        document_number=doc_number,
        created=True,
    )


def count_issue_operations_for_wz(db: Session, wz_id: int) -> int:
    return (
        db.query(StockOperation)
        .filter(StockOperation.document_id == int(wz_id))
        .count()
    )
