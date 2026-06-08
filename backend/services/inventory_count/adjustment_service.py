"""Post approved inventory — transactional RW/PW generation with idempotency."""

from __future__ import annotations

import logging
import secrets
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.adjustment import InventoryAdjustment
from ...models.inventory_count.constants import (
    ADJ_STATUS_POSTED,
    AUDIT_ADJUSTMENT,
    AUDIT_POSTED,
    INV_STATUS_APPROVED,
    INV_STATUS_POSTED,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.product import Product
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.warehouse import Warehouse
from ...services.document_number_service import assign_series_number_to_stock_document, require_warehouse_series
from ...services.inventory_carrier_ops import upsert_dock_inventory_for_loose_receipt
from ...services.inventory_lot_keys import NO_EXPIRY_SENTINEL
from ...services.order_item_pick_allocation_service import consume_inventory_fifo_slices
from ...services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from ...services.stock_operation_issue_service import append_issue_operation
from ...services.stock_operation_receipt_service import append_receipt_operation
from .audit_service import log_inventory_audit
from .errors import (
    InventoryDocumentNotFoundError,
    InventoryDuplicatePostError,
    InventoryInvalidTransitionError,
    InventoryPostingInProgressError,
)
from .kpi_service import recompute_document_kpis
from .location_lock_service import release_location_locks_for_document
from .observability import log_inventory_structured, observe_duration
from .strategy_service import get_result_policy, result_policy_updates_stock
from .valuation_service import resolve_line_unit_cost_net

logger = logging.getLogger(__name__)


def _create_inventory_stock_document(
    db: Session,
    *,
    doc: InventoryDocument,
    document_type: str,
    user_id: int | None,
) -> StockDocument:
    try:
        series = require_warehouse_series(
            db,
            tenant_id=int(doc.tenant_id),
            warehouse_id=int(doc.warehouse_id),
            subtype=document_type,
        )
    except Exception:
        series = None
    stock_doc = StockDocument(
        tenant_id=int(doc.tenant_id),
        warehouse_id=int(doc.warehouse_id),
        document_type=document_type,
        creation_source="INVENTORY_COUNT",
        status="completed",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_by_user_id=user_id,
        notes=f"Inwentaryzacja {doc.number}",
    )
    db.add(stock_doc)
    db.flush()
    if series is not None:
        wh = db.query(Warehouse).filter(Warehouse.id == int(doc.warehouse_id)).first()
        wh_code = str(getattr(wh, "code", None) or "").strip() or None
        assign_series_number_to_stock_document(db, stock_doc, series, warehouse_code=wh_code)
    return stock_doc


def _idempotent_post_response(doc: InventoryDocument, *, duplicate: bool = False) -> dict[str, Any]:
    return {
        "status": doc.status,
        "rw_stock_document_id": doc.rw_stock_document_id,
        "pw_stock_document_id": doc.pw_stock_document_id,
        "idempotent": duplicate,
        "result_policy": get_result_policy(doc),
    }


def finalize_inventory_without_stock_update(
    db: Session,
    *,
    doc: InventoryDocument,
    tenant_id: int,
    user_id: int | None = None,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    """Close document without RW/PW — count-only or report-only result policy."""
    if doc.status == INV_STATUS_POSTED:
        return _idempotent_post_response(doc, duplicate=True)

    prev_state = {"status": doc.status, "version": int(doc.version or 0)}
    if idempotency_key:
        doc.post_idempotency_key = str(idempotency_key)
    doc.status = INV_STATUS_POSTED
    doc.posted_at = datetime.utcnow()
    doc.posted_by_user_id = user_id
    doc.completed_at = datetime.utcnow()
    doc.posting_in_progress = 0
    doc.bump_version()
    release_location_locks_for_document(db, document=doc, user_id=user_id)
    recompute_document_kpis(db, doc)
    policy = get_result_policy(doc)
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(doc.id),
        user_id=user_id,
        action=AUDIT_POSTED,
        previous_state=prev_state,
        next_state={"status": doc.status, "result_policy": policy, "stock_updated": False},
        detail={"result_policy": policy, "adjustments": 0},
    )
    db.commit()
    db.refresh(doc)
    return {
        "status": doc.status,
        "rw_stock_document_id": None,
        "pw_stock_document_id": None,
        "adjustments_created": 0,
        "idempotent": False,
        "result_policy": policy,
        "stock_updated": False,
    }


def post_inventory_adjustments(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    user_id: int | None = None,
    idempotency_key: str | None = None,
    expected_version: int | None = None,
) -> dict[str, Any]:
    """
    Transactional posting — all RW/PW, movements, adjustments, audit, status in one commit.
    Idempotent when document already posted or idempotency_key matches prior successful post.
    """
    with observe_duration(
        "posting_duration_ms_total",
        event="posting.start",
        document_id=document_id,
        tenant_id=tenant_id,
    ):
        try:
            doc = (
                db.query(InventoryDocument)
                .filter(
                    InventoryDocument.id == int(document_id),
                    InventoryDocument.tenant_id == int(tenant_id),
                )
                .first()
            )
            if doc is None:
                raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")

            if doc.status == INV_STATUS_POSTED:
                log_inventory_structured("posting.idempotent", document_id=document_id)
                return _idempotent_post_response(doc, duplicate=True)

            if idempotency_key and doc.post_idempotency_key == str(idempotency_key):
                return _idempotent_post_response(doc, duplicate=True)

            if doc.status != INV_STATUS_APPROVED:
                raise InventoryInvalidTransitionError("Document must be approved before posting")

            if not result_policy_updates_stock(doc):
                return finalize_inventory_without_stock_update(
                    db,
                    doc=doc,
                    tenant_id=int(tenant_id),
                    user_id=user_id,
                    idempotency_key=idempotency_key,
                )

            if expected_version is not None and int(doc.version or 0) != int(expected_version):
                raise InventoryInvalidTransitionError(
                    f"Document version mismatch (expected {expected_version}, got {doc.version})"
                )

            if int(doc.posting_in_progress or 0) == 1:
                raise InventoryPostingInProgressError("Posting already in progress for this document")

            if doc.rw_stock_document_id or doc.pw_stock_document_id:
                raise InventoryDuplicatePostError(
                    "Stock correction documents already linked — refuse duplicate posting"
                )

            prev_state = {"status": doc.status, "version": int(doc.version or 0)}
            doc.posting_in_progress = 1
            if idempotency_key:
                doc.post_idempotency_key = str(idempotency_key)
            doc.bump_version()
            db.flush()

            lines = (
                db.query(InventoryDocumentLine)
                .filter(InventoryDocumentLine.inventory_document_id == int(doc.id))
                .all()
            )
            rw_doc: StockDocument | None = None
            pw_doc: StockDocument | None = None
            rw_lines = 0
            pw_lines = 0
            adjustments_created = 0

            for line in lines:
                diff = float(line.difference_quantity or 0)
                if abs(diff) < 1e-9:
                    continue
                product = db.query(Product).filter(Product.id == int(line.product_id)).first()
                unit_cost = resolve_line_unit_cost_net(db, document=doc, line=line, product=product)

                if diff < 0:
                    if rw_doc is None:
                        rw_doc = _create_inventory_stock_document(db, doc=doc, document_type="RW", user_id=user_id)
                        doc.rw_stock_document_id = int(rw_doc.id)
                    qty = abs(diff)
                    sd_line = StockDocumentItem(
                        document_id=int(rw_doc.id),
                        product_id=int(line.product_id),
                        ordered_quantity=qty,
                        received_quantity=qty,
                        quantity=qty,
                        purchase_price_net=unit_cost,
                        batch_number=line.batch_number or "",
                        expiry_date=date(9999, 12, 31),
                    )
                    db.add(sd_line)
                    db.flush()
                    slices = consume_inventory_fifo_slices(
                        db,
                        tenant_id=int(doc.tenant_id),
                        warehouse_id=int(doc.warehouse_id),
                        product_id=int(line.product_id),
                        location_id=int(line.location_id),
                        quantity=qty,
                    )
                    for sl in slices:
                        append_issue_operation(
                            db,
                            rw_doc,
                            sd_line,
                            float(sl.quantity),
                            from_location_id=int(line.location_id),
                            batch_number=sl.batch_number or "",
                            expiry_date=sl.expiry_date if sl.expiry_date < NO_EXPIRY_SENTINEL else None,
                            operator_admin_id=user_id,
                            metadata={
                                "inventory_document_id": int(doc.id),
                                "source_document_type": "RW",
                                "valuation_net": unit_cost,
                            },
                        )
                    rw_lines += 1
                    direction = "RW"
                    stock_doc_id = int(rw_doc.id)
                else:
                    if pw_doc is None:
                        pw_doc = _create_inventory_stock_document(db, doc=doc, document_type="PW", user_id=user_id)
                        doc.pw_stock_document_id = int(pw_doc.id)
                    qty = diff
                    sd_line = StockDocumentItem(
                        document_id=int(pw_doc.id),
                        product_id=int(line.product_id),
                        ordered_quantity=qty,
                        received_quantity=qty,
                        quantity=qty,
                        purchase_price_net=unit_cost,
                        batch_number=line.batch_number or "",
                        expiry_date=date(9999, 12, 31),
                    )
                    db.add(sd_line)
                    db.flush()
                    upsert_dock_inventory_for_loose_receipt(
                        db,
                        tenant_id=int(doc.tenant_id),
                        warehouse_id=int(doc.warehouse_id),
                        location_id=int(line.location_id),
                        product_id=int(line.product_id),
                        add_qty=float(qty),
                        batch_number=line.batch_number or "",
                        expiry_date=NO_EXPIRY_SENTINEL,
                        stock_disposition=STOCK_DISPOSITION_SALEABLE,
                    )
                    append_receipt_operation(db, pw_doc, sd_line, float(qty))
                    pw_lines += 1
                    direction = "PW"
                    stock_doc_id = int(pw_doc.id)

                adj = InventoryAdjustment(
                    inventory_document_id=int(doc.id),
                    inventory_document_line_id=int(line.id),
                    tenant_id=int(doc.tenant_id),
                    warehouse_id=int(doc.warehouse_id),
                    product_id=int(line.product_id),
                    location_id=int(line.location_id),
                    adjustment_quantity=diff,
                    direction=direction,
                    stock_document_id=stock_doc_id,
                    status=ADJ_STATUS_POSTED,
                )
                db.add(adj)
                adjustments_created += 1
                log_inventory_audit(
                    db,
                    tenant_id=int(tenant_id),
                    inventory_document_id=int(doc.id),
                    inventory_document_line_id=int(line.id),
                    user_id=user_id,
                    action=AUDIT_ADJUSTMENT,
                    previous_state={"difference": diff},
                    next_state={"direction": direction, "stock_document_id": stock_doc_id, "unit_cost_net": unit_cost},
                    detail={"direction": direction, "quantity": diff, "stock_document_id": stock_doc_id},
                )

            doc.status = INV_STATUS_POSTED
            doc.posted_at = datetime.utcnow()
            doc.posted_by_user_id = user_id
            doc.completed_at = datetime.utcnow()
            doc.posting_in_progress = 0
            doc.bump_version()
            release_location_locks_for_document(db, document=doc, user_id=user_id)
            recompute_document_kpis(db, doc)
            log_inventory_audit(
                db,
                tenant_id=int(tenant_id),
                inventory_document_id=int(doc.id),
                user_id=user_id,
                action=AUDIT_POSTED,
                previous_state=prev_state,
                next_state={
                    "status": doc.status,
                    "rw_stock_document_id": doc.rw_stock_document_id,
                    "pw_stock_document_id": doc.pw_stock_document_id,
                },
                detail={"rw_lines": rw_lines, "pw_lines": pw_lines, "adjustments": adjustments_created},
            )
            db.commit()
            db.refresh(doc)
            log_inventory_structured(
                "posting.completed",
                document_id=document_id,
                adjustments=adjustments_created,
                rw_lines=rw_lines,
                pw_lines=pw_lines,
            )
            return {
                "status": doc.status,
                "rw_stock_document_id": doc.rw_stock_document_id,
                "pw_stock_document_id": doc.pw_stock_document_id,
                "adjustments_created": adjustments_created,
                "idempotent": False,
            }
        except Exception:
            db.rollback()
            logger.exception("[inventory.posting] rollback document_id=%s", document_id)
            raise
