"""Staged, idempotent direct-sale completion — one commit per stage."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, Payment
from ...models.document_generation_job import DocumentGenerationJob
from ...models.order import Order
from ...models.order_item import OrderItem
from ...models.sale_document import SaleDocument
from ...models.sale_document_stock_link import SaleDocumentStockLink
from ...models.stock_document import StockDocument
from ...workers.document_generation_worker import get_job_document_number
from .complete_pipeline_log import log_session_state_transition
from .document_pipeline_service import (
    DirectSaleDocumentRequest,
    enqueue_direct_sale_documents,
    process_direct_sale_document_job,
)
from .errors import DirectSaleError
from .issue_plan_service import IssueAllocation, plan_issue_allocations
from .order_service import create_order_from_session, load_order_for_session
from .payment_service import orchestrate_direct_sale_payment, load_payment_for_session
from .complete_debug_log import commit_with_logging, log_stage_failure, rollback_db_safely
from .pipeline_log import new_transaction_id, pipeline_stage_span
from .pipeline_state import (
    PIPELINE_COMPLETED,
    PIPELINE_FAILED,
    PIPELINE_PAYMENT_CONFIRMED,
    PIPELINE_PAYMENT_STARTED,
    STAGE_COMPLETE_SESSION,
    STAGE_CREATE_ORDER_AND_PAYMENT,
    STAGE_CREATE_WZ,
    STAGE_GENERATE_DOCUMENTS,
    STAGE_LOCK_AND_VALIDATE,
    STAGE_ORDER,
    infer_pipeline_status_from_session,
    load_pipeline_entities,
    mark_pipeline_failed,
    mark_pipeline_success,
    merge_pipeline_entities,
    reload_session_for_stage,
    resume_stage_index,
    should_run_stage,
)
from .wz_service import create_and_post_wz_for_direct_sale, load_wz_for_sale_document
from ..operational_features_context import build_operational_features_context
from ..operational_observability import log_direct_sale_complete
from ..operational_sales_events import emit_operational_sales_event

logger = logging.getLogger(__name__)

_COMPLETABLE_UI_STATUSES = frozenset({"ACTIVE", "CHECKOUT", "SUSPENDED", "FAILED"})


@dataclass
class StageEntities:
    order_id: int | None = None
    payment_id: int | None = None
    document_job_id: int | None = None
    sale_document_id: str | None = None
    document_number: str | None = None
    stock_document_id: int | None = None
    wz_number: str | None = None
    allocations: list[IssueAllocation] = field(default_factory=list)
    document_warning: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            k: v
            for k, v in {
                "order_id": self.order_id,
                "payment_id": self.payment_id,
                "document_job_id": self.document_job_id,
                "sale_document_id": self.sale_document_id,
                "document_number": self.document_number,
                "stock_document_id": self.stock_document_id,
                "wz_number": self.wz_number,
                "document_warning": self.document_warning,
            }.items()
            if v is not None
        }


def _session_total(sess: DirectSaleSession) -> float:
    total = 0.0
    for ln in sess.lines or []:
        qty = float(ln.quantity or 0)
        unit = float(ln.unit_price) if ln.unit_price is not None else 0.0
        disc = float(ln.discount_amount or 0)
        total += max(0.0, unit * qty - disc)
    return round(total, 2)


def _commit_stage(db: Session, sess: DirectSaleSession, *, stage: str, entities: StageEntities) -> None:
    mark_pipeline_success(sess, stage=stage, entity_patch=entities.as_dict())
    commit_with_logging(
        db,
        stage=stage,
        session_id=int(sess.id),
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
    )
    db.refresh(sess)


def _fail_stage(db: Session, sess: DirectSaleSession, *, stage: str, exc: Exception, entities: StageEntities) -> None:
    # Scalars only — never touch relationships on a session that may be pending rollback.
    sid = int(sess.id)
    tid = int(sess.tenant_id)
    wid = int(sess.warehouse_id)
    log_stage_failure(exc, stage=stage, session_id=sid, context="pipeline_fail_stage")
    rollback_db_safely(db, context=f"fail_stage:{stage}")
    sess = reload_session_for_stage(db, session_id=sid, tenant_id=tid)
    if sess is None:
        raise DirectSaleError("Sesja nie istnieje po błędzie pipeline.", code="pipeline_failed", step=stage) from exc
    mark_pipeline_failed(sess, stage=stage, exc=exc, entity_patch=entities.as_dict())
    try:
        commit_with_logging(
            db,
            stage=f"{stage}_failure_persist",
            session_id=sid,
            tenant_id=tid,
            warehouse_id=wid,
        )
    except Exception as commit_exc:
        from .complete_debug_log import log_unhandled_complete_exception

        log_unhandled_complete_exception(
            commit_exc,
            session_id=int(sess.id),
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            stage=f"{stage}_failure_persist",
            context="fail_stage_commit",
        )
        raise commit_exc from exc
    raise exc


def _load_entities_from_session(sess: DirectSaleSession) -> StageEntities:
    raw = load_pipeline_entities(sess)
    allocs: list[IssueAllocation] = []
    return StageEntities(
        order_id=int(raw["order_id"]) if raw.get("order_id") else None,
        payment_id=int(raw["payment_id"]) if raw.get("payment_id") else None,
        document_job_id=int(raw["document_job_id"]) if raw.get("document_job_id") else None,
        sale_document_id=str(raw["sale_document_id"]) if raw.get("sale_document_id") else None,
        document_number=str(raw["document_number"]) if raw.get("document_number") else None,
        stock_document_id=int(raw["stock_document_id"]) if raw.get("stock_document_id") else None,
        wz_number=str(raw["wz_number"]) if raw.get("wz_number") else None,
        allocations=allocs,
        document_warning=str(raw.get("document_warning") or "") or None,
    )


def _stage_lock_and_validate(
    db: Session,
    sess: DirectSaleSession,
    entities: StageEntities,
) -> None:
    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="empty_session")
    ui = str(sess.status or "").strip().upper()
    if ui not in _COMPLETABLE_UI_STATUSES:
        raise DirectSaleError("Sesja nie może być zakończona.", code="invalid_status")
    if infer_pipeline_status_from_session(sess) == PIPELINE_COMPLETED:
        return
    entities.allocations = plan_issue_allocations(db, sess, list(sess.lines or []))
    merge_pipeline_entities(sess, {"validated": True, "allocation_count": len(entities.allocations)})


def _stage_create_order_and_payment(
    db: Session,
    sess: DirectSaleSession,
    entities: StageEntities,
    *,
    payment_method: str,
    payment_splits: list[dict] | None,
    performed_by_user_id: int | None,
) -> None:
    order, items_by_line = load_order_for_session(db, sess)
    if order is None:
        order, items_by_line = create_order_from_session(db, sess, lines=list(sess.lines or []))
    entities.order_id = int(order.id)
    merge_pipeline_entities(sess, {"order_id": entities.order_id})

    pay = load_payment_for_session(db, sess, order_id=entities.order_id)
    if pay is None:
        pay = orchestrate_direct_sale_payment(
            db,
            order=order,
            sess=sess,
            amount=_session_total(sess),
            method=payment_method,
            payment_splits=payment_splits,
            performed_by_user_id=performed_by_user_id,
        )
    entities.payment_id = int(pay.id)
    sess.order_id = int(order.id)
    if not getattr(sess, "pipeline_status", None) or str(sess.pipeline_status) == PIPELINE_FAILED:
        sess.pipeline_status = PIPELINE_PAYMENT_STARTED
    merge_pipeline_entities(
        sess,
        {
            "order_id": entities.order_id,
            "payment_id": entities.payment_id,
            "items_by_line": {str(k): int(v.id) for k, v in items_by_line.items()},
        },
    )


def _stage_generate_documents(
    db: Session,
    sess: DirectSaleSession,
    entities: StageEntities,
    *,
    document_subtype: str,
    performed_by_user_id: int | None,
) -> None:
    if not entities.order_id:
        raise DirectSaleError("Brak zamówienia przed generowaniem dokumentu.", code="order_missing")

    order = db.query(Order).filter(Order.id == int(entities.order_id)).first()
    if order is None:
        raise DirectSaleError("Zamówienie nie istnieje.", code="order_not_found", http_status=404)

    existing_doc = (
        db.query(SaleDocument)
        .filter(SaleDocument.order_id == int(entities.order_id))
        .order_by(SaleDocument.created_at.desc())
        .first()
    )
    if existing_doc is not None:
        entities.sale_document_id = str(existing_doc.id)
        entities.document_number = str(existing_doc.document_number or "")
        job = (
            db.query(DocumentGenerationJob)
            .filter(
                DocumentGenerationJob.session_id == int(sess.id),
                DocumentGenerationJob.tenant_id == int(sess.tenant_id),
            )
            .order_by(DocumentGenerationJob.id.desc())
            .first()
        )
        if job is not None:
            entities.document_job_id = int(job.id)
        return

    doc_result = enqueue_direct_sale_documents(
        db,
        DirectSaleDocumentRequest(
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            order_id=int(entities.order_id),
            session_id=int(sess.id),
            document_subtype=document_subtype,
            performed_by_user_id=performed_by_user_id,
            device_id=int(sess.workstation_id) if sess.workstation_id else None,
        ),
    )
    entities.document_job_id = int(doc_result.job_id)
    processed = process_direct_sale_document_job(db, doc_result.job_id)
    entities.document_number = processed.document_number
    if str(processed.status or "").upper() == "GENERATED":
        entities.sale_document_id = str(processed.sale_document_id or "")
    elif str(processed.status or "").upper() in ("FAILED", "RETRYING") and not processed.document_number:
        entities.document_warning = "Dokument zostanie wygenerowany asynchronicznie."


def _stage_create_wz(
    db: Session,
    sess: DirectSaleSession,
    entities: StageEntities,
    *,
    performed_by_user_id: int | None,
) -> None:
    if not entities.sale_document_id:
        entities.document_warning = entities.document_warning or "Brak dokumentu PA/FV — WZ nie został utworzony."
        return

    sale_doc = (
        db.query(SaleDocument)
        .filter(
            SaleDocument.id == str(entities.sale_document_id),
            SaleDocument.tenant_id == int(sess.tenant_id),
        )
        .first()
    )
    if sale_doc is None:
        entities.document_warning = "Dokument sprzedaży nie istnieje — WZ pominięte."
        return

    existing_wz = load_wz_for_sale_document(db, sale_document_id=str(sale_doc.id))
    if existing_wz is not None:
        entities.stock_document_id = int(existing_wz.id)
        entities.wz_number = str(getattr(existing_wz, "document_number", None) or "")
        return

    if not entities.order_id:
        raise DirectSaleError("Brak zamówienia przed WZ.", code="order_missing")
    order = db.query(Order).filter(Order.id == int(entities.order_id)).first()
    if order is None:
        raise DirectSaleError("Zamówienie nie istnieje.", code="order_not_found", http_status=404)

    raw = load_pipeline_entities(sess)
    items_map = raw.get("items_by_line") or {}
    order_items_by_line: dict[int, OrderItem] = {}
    if items_map:
        oi_ids = [int(v) for v in items_map.values() if v]
        rows = db.query(OrderItem).filter(OrderItem.id.in_(oi_ids)).all() if oi_ids else []
        by_id = {int(r.id): r for r in rows}
        for line_id, oi_id in items_map.items():
            oi = by_id.get(int(oi_id))
            if oi is not None:
                order_items_by_line[int(line_id)] = oi
    if not order_items_by_line:
        _, rebuilt = load_order_for_session(db, sess)
        if rebuilt:
            order_items_by_line = rebuilt

    if not entities.allocations:
        entities.allocations = plan_issue_allocations(db, sess, list(sess.lines or []))

    wz_result = create_and_post_wz_for_direct_sale(
        db,
        order=order,
        sess=sess,
        sale_document=sale_doc,
        allocations=entities.allocations,
        order_items_by_line=order_items_by_line,
        performed_by_user_id=performed_by_user_id,
    )
    entities.stock_document_id = int(wz_result.stock_document_id)
    entities.wz_number = str(wz_result.document_number)


def _stage_complete_session(
    db: Session,
    sess: DirectSaleSession,
    entities: StageEntities,
    *,
    performed_by_user_id: int | None,
) -> None:
    if not entities.order_id or not entities.payment_id:
        raise DirectSaleError("Brak zamówienia lub płatności do finalizacji.", code="pipeline_incomplete")
    now = datetime.utcnow()
    from_status = str(sess.status or "")
    sess.status = "COMPLETED"
    sess.order_id = int(entities.order_id)
    sess.completed_at = now
    sess.last_activity_at = now
    sess.expires_at = None
    sess.pipeline_status = PIPELINE_COMPLETED
    sess.pipeline_failed_stage = None
    log_session_state_transition(
        session_id=int(sess.id),
        from_status=from_status,
        to_status="COMPLETED",
        stage=STAGE_COMPLETE_SESSION,
    )
    emit_operational_sales_event(
        db,
        "direct_sale.completed",
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        order_id=int(entities.order_id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        extra={
            "payment_id": int(entities.payment_id),
            "document_job_id": entities.document_job_id,
            "document_number": entities.document_number,
            "stock_document_id": entities.stock_document_id,
            "total_amount": _session_total(sess),
        },
    )


def run_staged_complete_pipeline(
    db: Session,
    sess: DirectSaleSession,
    *,
    payment_method: str = "CASH",
    document_subtype: str = "RECEIPT",
    payment_splits: list[dict] | None = None,
    performed_by_user_id: int | None = None,
) -> StageEntities:
    """Execute completion in atomic committed stages; safe to retry after FAILED."""
    sid = int(sess.id)
    tid = int(sess.tenant_id)
    txn_id = new_transaction_id()
    entities = _load_entities_from_session(sess)
    start_idx = resume_stage_index(sess)

    if infer_pipeline_status_from_session(sess) == PIPELINE_COMPLETED:
        return entities

    for stage in STAGE_ORDER[start_idx:]:
        if not should_run_stage(sess, stage) and stage != STAGE_COMPLETE_SESSION:
            continue
        with pipeline_stage_span(session_id=sid, stage=stage, transaction_id=txn_id, entity_ids=entities.as_dict()):
            try:
                if stage == STAGE_LOCK_AND_VALIDATE:
                    _stage_lock_and_validate(db, sess, entities)
                elif stage == STAGE_CREATE_ORDER_AND_PAYMENT:
                    _stage_create_order_and_payment(
                        db,
                        sess,
                        entities,
                        payment_method=payment_method,
                        payment_splits=payment_splits,
                        performed_by_user_id=performed_by_user_id,
                    )
                elif stage == STAGE_GENERATE_DOCUMENTS:
                    _stage_generate_documents(
                        db,
                        sess,
                        entities,
                        document_subtype=document_subtype,
                        performed_by_user_id=performed_by_user_id,
                    )
                elif stage == STAGE_CREATE_WZ:
                    _stage_create_wz(db, sess, entities, performed_by_user_id=performed_by_user_id)
                elif stage == STAGE_COMPLETE_SESSION:
                    _stage_complete_session(
                        db,
                        sess,
                        entities,
                        performed_by_user_id=performed_by_user_id,
                    )
                _commit_stage(db, sess, stage=stage, entities=entities)
                sess = reload_session_for_stage(db, session_id=sid, tenant_id=tid) or sess
                entities = _load_entities_from_session(sess)
            except Exception as exc:
                _fail_stage(db, sess, stage=stage, exc=exc, entities=entities)

    feat = build_operational_features_context(db, tenant_id=tid, warehouse_id=int(sess.warehouse_id))
    log_direct_sale_complete(
        session_id=sid,
        order_id=entities.order_id,
        tenant_id=tid,
        warehouse_id=int(sess.warehouse_id),
        payment_id=entities.payment_id,
        total_amount=_session_total(sess),
        features=feat.as_log_dict(),
    )
    return entities
