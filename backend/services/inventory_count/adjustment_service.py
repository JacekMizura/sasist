"""Post approved inventory — transactional RW/PW generation with idempotency."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from ...database import SessionLocal
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
from ...services.stock_document_factory import create_stock_document
from ...services.stock_operation_issue_service import append_issue_operation
from ...services.stock_operation_receipt_service import append_receipt_operation
from .audit_service import log_inventory_audit
from .errors import (
    InventoryDocumentNotFoundError,
    InventoryDuplicatePostError,
    InventoryInvalidTransitionError,
    InventoryPostingFailedError,
)
from .full_inventory_posting_service import build_inventory_posting_plans, posting_plan_to_log_dict
from .posting_validation_service import validate_and_prepare_document_for_posting
from .kpi_service import recompute_document_kpis
from .location_lock_service import release_location_locks_for_document
from .observability import log_inventory_structured, observe_duration
from .strategy_service import get_result_policy, result_policy_updates_stock
from .valuation_service import resolve_line_unit_cost_net

logger = logging.getLogger(__name__)


def _log_post_inventory(phase: str, **fields: Any) -> None:
    logger.info("[POST INVENTORY] %s | %s", phase, json.dumps(fields, ensure_ascii=False, default=str))


def _resolve_posting_lock_conflict(doc: InventoryDocument) -> None:
    """Clear orphan posting locks.

    ``posting_in_progress`` is only flushed inside the posting transaction and must
    never be visible to other sessions while work is in flight. A committed value of
    ``1`` therefore means a prior attempt failed without cleanup — never block forever.
    """
    if int(doc.posting_in_progress or 0) != 1:
        return
    _log_post_inventory(
        "clear orphan lock",
        document_id=int(doc.id),
        status=doc.status,
        updated_at=str(doc.updated_at),
    )
    doc.posting_in_progress = 0
    doc.bump_version()


def _force_release_posting_lock(
    *,
    tenant_id: int,
    document_id: int,
    reason: str,
) -> None:
    """Best-effort unlock in a fresh transaction — survives rollback / worker edge cases."""
    unlock_db = SessionLocal()
    try:
        doc = (
            unlock_db.query(InventoryDocument)
            .filter(
                InventoryDocument.id == int(document_id),
                InventoryDocument.tenant_id == int(tenant_id),
            )
            .with_for_update()
            .first()
        )
        if doc is None:
            unlock_db.rollback()
            return
        if int(doc.posting_in_progress or 0) == 1 and doc.status != INV_STATUS_POSTED:
            doc.posting_in_progress = 0
            doc.bump_version()
            unlock_db.commit()
            _log_post_inventory("release lock", document_id=document_id, reason=reason)
            return
        unlock_db.rollback()
    except Exception:
        unlock_db.rollback()
        logger.exception("[POST INVENTORY] release lock failed document_id=%s", document_id)
    finally:
        unlock_db.close()


def _load_document_for_posting(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
) -> InventoryDocument:
    doc = (
        db.query(InventoryDocument)
        .filter(
            InventoryDocument.id == int(document_id),
            InventoryDocument.tenant_id == int(tenant_id),
        )
        .with_for_update()
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")
    return doc


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
    stock_doc = create_stock_document(
        db,
        context=f"inventory_count_{document_type}",
        tenant_id=int(doc.tenant_id),
        warehouse_id=int(doc.warehouse_id),
        document_type=document_type,
        creation_source="INVENTORY_COUNT",
        status="completed",
        receiving_status="DONE",
        putaway_status="DONE",
        relocation_status="DONE",
        created_by_user_id=user_id,
    )
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
    document_id_int = int(document_id)
    tenant_id_int = int(tenant_id)
    lock_acquired = False

    _log_post_inventory(
        "start posting",
        document_id=document_id_int,
        tenant_id=tenant_id_int,
        user_id=user_id,
        idempotency_key=idempotency_key,
    )

    try:
        with observe_duration(
            "posting_duration_ms_total",
            event="posting.start",
            document_id=document_id_int,
            tenant_id=tenant_id_int,
        ):
            doc = _load_document_for_posting(db, tenant_id=tenant_id_int, document_id=document_id_int)

            if doc.status == INV_STATUS_POSTED:
                log_inventory_structured("posting.idempotent", document_id=document_id_int)
                return _idempotent_post_response(doc, duplicate=True)

            if idempotency_key and doc.post_idempotency_key == str(idempotency_key):
                return _idempotent_post_response(doc, duplicate=True)

            if doc.status != INV_STATUS_APPROVED:
                raise InventoryInvalidTransitionError("Document must be approved before posting")

            if not result_policy_updates_stock(doc):
                return finalize_inventory_without_stock_update(
                    db,
                    doc=doc,
                    tenant_id=tenant_id_int,
                    user_id=user_id,
                    idempotency_key=idempotency_key,
                )

            if expected_version is not None and int(doc.version or 0) != int(expected_version):
                raise InventoryInvalidTransitionError(
                    f"Document version mismatch (expected {expected_version}, got {doc.version})"
                )

            _resolve_posting_lock_conflict(doc)

            if doc.rw_stock_document_id or doc.pw_stock_document_id:
                raise InventoryDuplicatePostError(
                    "Stock correction documents already linked — refuse duplicate posting"
                )

            prev_state = {"status": doc.status, "version": int(doc.version or 0)}
            doc.posting_in_progress = 1
            doc.bump_version()
            db.flush()
            lock_acquired = True
            _log_post_inventory("acquire lock", document_id=document_id_int, version=int(doc.version or 0))

            lines = validate_and_prepare_document_for_posting(db, doc=doc)
            posting_plans = build_inventory_posting_plans(db, doc=doc, lines=lines)
            rw_doc: StockDocument | None = None
            pw_doc: StockDocument | None = None
            rw_lines = 0
            pw_lines = 0
            adjustments_created = 0

            _log_post_inventory(
                "transaction start",
                document_id=document_id_int,
                line_count=len(lines),
                plan_count=len(posting_plans),
            )

            for plan in posting_plans:
                diff = float(plan.difference_quantity)
                if abs(diff) < 1e-9:
                    continue
                line = plan.line
                product = db.query(Product).filter(Product.id == int(plan.product_id)).first()
                unit_cost = resolve_line_unit_cost_net(db, document=doc, line=line, product=product)
                batch_number = plan.batch_number or (line.batch_number if line else "") or ""

                try:
                    if diff < 0:
                        if rw_doc is None:
                            rw_doc = _create_inventory_stock_document(db, doc=doc, document_type="RW", user_id=user_id)
                            doc.rw_stock_document_id = int(rw_doc.id)
                            _log_post_inventory(
                                "rw creation",
                                document_id=document_id_int,
                                rw_stock_document_id=int(rw_doc.id),
                            )
                        qty = abs(diff)
                        sd_line = StockDocumentItem(
                            document_id=int(rw_doc.id),
                            product_id=int(plan.product_id),
                            ordered_quantity=qty,
                            received_quantity=qty,
                            quantity=qty,
                            purchase_price_net=unit_cost,
                            batch_number=batch_number,
                            expiry_date=date(9999, 12, 31),
                        )
                        db.add(sd_line)
                        db.flush()
                        _log_post_inventory(
                            "rw line",
                            document_id=document_id_int,
                            **posting_plan_to_log_dict(plan),
                        )
                        slices = consume_inventory_fifo_slices(
                            db,
                            tenant_id=int(doc.tenant_id),
                            warehouse_id=int(doc.warehouse_id),
                            product_id=int(plan.product_id),
                            location_id=int(plan.location_id),
                            quantity=qty,
                        )
                        for sl in slices:
                            append_issue_operation(
                                db,
                                rw_doc,
                                sd_line,
                                float(sl.quantity),
                                from_location_id=int(plan.location_id),
                                batch_number=sl.batch_number or "",
                                expiry_date=sl.expiry_date if sl.expiry_date < NO_EXPIRY_SENTINEL else None,
                                operator_admin_id=user_id,
                                metadata={
                                    "inventory_document_id": int(doc.id),
                                    "source_document_type": "RW",
                                    "valuation_net": unit_cost,
                                    "zeroing_reason": plan.reason,
                                },
                            )
                        rw_lines += 1
                        direction = "RW"
                        stock_doc_id = int(rw_doc.id)
                    else:
                        if pw_doc is None:
                            pw_doc = _create_inventory_stock_document(db, doc=doc, document_type="PW", user_id=user_id)
                            doc.pw_stock_document_id = int(pw_doc.id)
                            _log_post_inventory(
                                "pw creation",
                                document_id=document_id_int,
                                pw_stock_document_id=int(pw_doc.id),
                            )
                        qty = diff
                        sd_line = StockDocumentItem(
                            document_id=int(pw_doc.id),
                            product_id=int(plan.product_id),
                            ordered_quantity=qty,
                            received_quantity=qty,
                            quantity=qty,
                            purchase_price_net=unit_cost,
                            batch_number=batch_number,
                            expiry_date=date(9999, 12, 31),
                        )
                        db.add(sd_line)
                        db.flush()
                        _log_post_inventory(
                            "pw line",
                            document_id=document_id_int,
                            **posting_plan_to_log_dict(plan),
                        )
                        upsert_dock_inventory_for_loose_receipt(
                            db,
                            tenant_id=int(doc.tenant_id),
                            warehouse_id=int(doc.warehouse_id),
                            location_id=int(plan.location_id),
                            product_id=int(plan.product_id),
                            add_qty=float(qty),
                            batch_number=batch_number,
                            expiry_date=NO_EXPIRY_SENTINEL,
                            stock_disposition=STOCK_DISPOSITION_SALEABLE,
                        )
                        append_receipt_operation(db, pw_doc, sd_line, float(qty))
                        pw_lines += 1
                        direction = "PW"
                        stock_doc_id = int(pw_doc.id)

                    adj = InventoryAdjustment(
                        inventory_document_id=int(doc.id),
                        inventory_document_line_id=int(line.id) if line else None,
                        tenant_id=int(doc.tenant_id),
                        warehouse_id=int(doc.warehouse_id),
                        product_id=int(plan.product_id),
                        location_id=int(plan.location_id),
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
                        inventory_document_line_id=int(line.id) if line else None,
                        user_id=user_id,
                        action=AUDIT_ADJUSTMENT,
                        previous_state={"difference": diff, "reason": plan.reason},
                        next_state={"direction": direction, "stock_document_id": stock_doc_id, "unit_cost_net": unit_cost},
                        detail={
                            "direction": direction,
                            "quantity": diff,
                            "stock_document_id": stock_doc_id,
                            "reason": plan.reason,
                            **posting_plan_to_log_dict(plan),
                        },
                    )
                except ValueError as exc:
                    raise InventoryPostingFailedError(
                        str(exc),
                        details={
                            "line_id": int(line.id) if line else None,
                            "product_id": int(plan.product_id),
                            "location_id": int(plan.location_id),
                            "difference_quantity": diff,
                            "phase": "rw_stock_consume",
                            "reason": plan.reason,
                        },
                    ) from exc
                except Exception as exc:
                    logger.exception(
                        "[POST INVENTORY] line failed document_id=%s line_id=%s diff=%s reason=%s",
                        document_id_int,
                        line.id if line else None,
                        diff,
                        plan.reason,
                    )
                    raise InventoryPostingFailedError(
                        f"Posting failed on product {plan.product_id}: {type(exc).__name__}: {exc}",
                        details={
                            "line_id": int(line.id) if line else None,
                            "product_id": int(plan.product_id),
                            "difference_quantity": diff,
                            "error_type": type(exc).__name__,
                            "reason": plan.reason,
                        },
                    ) from exc

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
            _log_post_inventory(
                "commit",
                document_id=document_id_int,
                adjustments=adjustments_created,
                rw_lines=rw_lines,
                pw_lines=pw_lines,
            )
            db.commit()
            lock_acquired = False
            db.refresh(doc)
            _log_post_inventory("release lock", document_id=document_id_int, reason="success")
            log_inventory_structured(
                "posting.completed",
                document_id=document_id_int,
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
    except Exception as exc:
        _log_post_inventory(
            "rollback",
            document_id=document_id_int,
            error=f"{type(exc).__name__}: {exc}",
        )
        try:
            db.rollback()
        except Exception:
            logger.exception("[POST INVENTORY] rollback failed document_id=%s", document_id_int)
        raise
    finally:
        if lock_acquired:
            _force_release_posting_lock(
                tenant_id=tenant_id_int,
                document_id=document_id_int,
                reason="posting_failed_cleanup",
            )
