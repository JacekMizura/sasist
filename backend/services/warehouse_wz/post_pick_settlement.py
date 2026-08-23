"""Canonical post-pick settlement — documentary WZ after physical decrement."""

from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.pick import Pick
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.stock_operation import StockOperation
from ..activity_log.domain_activity import find_activity_by_correlation, record_domain_activity
from ..activity_log.domain_event_codes import ORDER_WZ_DOCUMENTARY_CREATED
from ..document_number_service import (
    DocumentSeriesOperationalError,
    assign_series_number_to_stock_document,
    require_warehouse_series,
)
from ..order_reservations.rz_document_service import find_active_rz_document
from ..stock_document_service import compute_pz_line_financial_totals
from .constants import (
    FULFILLMENT_KIND_CART,
    FULFILLMENT_KIND_CARTLESS,
    FULFILLMENT_KIND_RECOVERY,
    SETTLEMENT_WMS_PICK,
    build_fulfillment_key,
    wms_pick_idempotency_key,
)
from .pick_movement_link import link_documentary_wz_to_pick_movements

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DocumentaryWzResult:
    stock_document_id: int
    document_number: str
    created: bool
    idempotency_key: str


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


def group_finalized_pick_ids_by_order(
    db: Session,
    *,
    finalized_pick_ids: Iterable[int],
) -> dict[int, list[int]]:
    ids = [int(x) for x in finalized_pick_ids if int(x) > 0]
    if not ids:
        return {}
    rows = db.query(Pick.id, Pick.order_id).filter(Pick.id.in_(ids)).all()
    out: dict[int, list[int]] = defaultdict(list)
    for pick_id, order_id in rows:
        if order_id is None:
            continue
        out[int(order_id)].append(int(pick_id))
    return dict(out)


def _aggregate_pick_lines(picks: list[Pick]) -> list[dict]:
    buckets: dict[tuple[int, int | None, int, str, date], float] = defaultdict(float)
    for p in picks:
        qty = float(p.quantity or 0)
        if qty <= 1e-12:
            continue
        bn = str(getattr(p, "batch_number", None) or "").strip()
        exp = getattr(p, "expiry_date", None) or date(9999, 12, 31)
        key = (int(p.product_id), int(p.order_item_id) if p.order_item_id else None, int(p.location_id), bn, exp)
        buckets[key] += qty
    return [
        {
            "product_id": product_id,
            "order_item_id": order_item_id,
            "location_id": location_id,
            "batch_number": batch_number,
            "expiry_date": expiry_date,
            "quantity": round(float(qty), 6),
        }
        for (product_id, order_item_id, location_id, batch_number, expiry_date), qty in buckets.items()
    ]


def _result_from_existing(existing: StockDocument, *, idempotency_key: str) -> DocumentaryWzResult:
    return DocumentaryWzResult(
        stock_document_id=int(existing.id),
        document_number=str(getattr(existing, "document_number", None) or ""),
        created=False,
        idempotency_key=idempotency_key,
    )


def _record_documentary_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    wz_id: int,
    doc_number: str,
    idempotency_key: str,
    pick_ids: list[int],
    fulfillment_key: str,
    metadata_extra: dict | None,
) -> None:
    if find_activity_by_correlation(db, correlation_id=idempotency_key, tenant_id=int(tenant_id)):
        return
    meta = {
        "settlement_mode": SETTLEMENT_WMS_PICK,
        "pick_ids": [int(x) for x in pick_ids],
        "fulfillment_key": fulfillment_key,
    }
    if metadata_extra:
        meta.update(metadata_extra)
    record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        event_type=ORDER_WZ_DOCUMENTARY_CREATED,
        description=f"Utworzono dokument WZ {doc_number} dla zrealizowanego wydania magazynowego.",
        order_id=int(order_id),
        warehouse_id=int(warehouse_id),
        stock_document_id=int(wz_id),
        correlation_id=idempotency_key,
        metadata=meta,
    )


def _attach_pick_movements_to_documentary_wz(
    db: Session,
    *,
    tenant_id: int,
    pick_ids: list[int],
    stock_document_id: int,
) -> None:
    if not pick_ids:
        return
    linked = link_documentary_wz_to_pick_movements(
        db,
        tenant_id=int(tenant_id),
        pick_ids=pick_ids,
        stock_document_id=int(stock_document_id),
    )
    if linked:
        logger.info(
            "[warehouse_wz.pick_link] wz_id=%s picks=%s operations_linked=%s",
            int(stock_document_id),
            len(pick_ids),
            linked,
        )


def ensure_documentary_wz_for_pick_settlement(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order: Order,
    pick_ids: list[int],
    fulfillment_kind: str,
    fulfillment_session_id: str | int,
    performed_by_user_id: int | None = None,
    metadata_extra: dict | None = None,
) -> DocumentaryWzResult | None:
    """
    Idempotent documentary WZ for one order + fulfillment session.
    Uses DB unique (tenant_id, idempotency_key) — concurrent retries are safe.
    """
    oid = int(order.id)
    fulfillment_key = build_fulfillment_key(kind=fulfillment_kind, session_id=fulfillment_session_id)
    idem = wms_pick_idempotency_key(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        fulfillment_key=fulfillment_key,
        order_id=oid,
    )

    existing = load_wz_by_idempotency_key(db, tenant_id=int(tenant_id), idempotency_key=idem)
    if existing is not None:
        result = _result_from_existing(existing, idempotency_key=idem)
        _attach_pick_movements_to_documentary_wz(
            db,
            tenant_id=int(tenant_id),
            pick_ids=pick_ids,
            stock_document_id=result.stock_document_id,
        )
        return result

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

    try:
        with db.begin_nested():
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

            _record_documentary_activity(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                order_id=oid,
                wz_id=int(wz.id),
                doc_number=doc_number,
                idempotency_key=idem,
                pick_ids=pick_ids,
                fulfillment_key=fulfillment_key,
                metadata_extra=metadata_extra,
            )
            created_wz_id = int(wz.id)
            created_doc_number = doc_number
    except IntegrityError:
        existing = load_wz_by_idempotency_key(db, tenant_id=int(tenant_id), idempotency_key=idem)
        if existing is not None:
            logger.info(
                "[warehouse_wz.documentary] idempotent retry order_id=%s fulfillment=%s",
                oid,
                fulfillment_key,
            )
            result = _result_from_existing(existing, idempotency_key=idem)
            _attach_pick_movements_to_documentary_wz(
                db,
                tenant_id=int(tenant_id),
                pick_ids=pick_ids,
                stock_document_id=result.stock_document_id,
            )
            return result
        raise

    _attach_pick_movements_to_documentary_wz(
        db,
        tenant_id=int(tenant_id),
        pick_ids=pick_ids,
        stock_document_id=created_wz_id,
    )

    logger.info(
        "[warehouse_wz.documentary] wz_id=%s number=%s order_id=%s fulfillment=%s picks=%s",
        created_wz_id,
        created_doc_number,
        oid,
        fulfillment_key,
        len(pick_ids),
    )
    return DocumentaryWzResult(
        stock_document_id=created_wz_id,
        document_number=created_doc_number,
        created=True,
        idempotency_key=idem,
    )


def ensure_documentary_wz_for_pick_settlement_batch(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    orders_by_id: dict[int, Order],
    finalized_by_order: dict[int, list[int]],
    fulfillment_kind: str,
    fulfillment_session_id: str | int,
    performed_by_user_id: int | None = None,
) -> dict[int, DocumentaryWzResult]:
    """Run canonical post-pick documentary WZ for each order in the settlement batch."""
    out: dict[int, DocumentaryWzResult] = {}
    for oid, pick_ids in finalized_by_order.items():
        if not pick_ids:
            continue
        order = orders_by_id.get(int(oid))
        if order is None:
            continue
        meta = {"fulfillment_kind": str(fulfillment_kind)}
        if fulfillment_kind == FULFILLMENT_KIND_CART:
            meta["cart_id"] = int(fulfillment_session_id)
        elif fulfillment_kind == FULFILLMENT_KIND_CARTLESS:
            meta["picking_session_id"] = int(fulfillment_session_id)
        elif fulfillment_kind == FULFILLMENT_KIND_RECOVERY:
            meta["recovery_task_id"] = int(fulfillment_session_id)
        result = ensure_documentary_wz_for_pick_settlement(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            order=order,
            pick_ids=pick_ids,
            fulfillment_kind=fulfillment_kind,
            fulfillment_session_id=fulfillment_session_id,
            performed_by_user_id=performed_by_user_id,
            metadata_extra=meta,
        )
        if result is not None:
            out[int(oid)] = result
    return out


def count_issue_operations_for_wz(db: Session, wz_id: int) -> int:
    return (
        db.query(StockOperation)
        .filter(StockOperation.document_id == int(wz_id))
        .count()
    )
