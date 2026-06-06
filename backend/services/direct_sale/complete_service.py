"""Atomic direct sale completion — order-first transactional pipeline."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, Payment
from ...models.document_generation_job import DocumentGenerationJob
from ...models.order import Order
from ...workers.document_generation_worker import get_job_document_number
from .complete_pipeline_log import log_complete_stage, log_complete_step, log_session_state_transition
from ..direct_sales_settings_service import resolve_direct_sales_settings
from .document_pipeline_service import (
    DirectSaleDocumentRequest,
    enqueue_direct_sale_documents,
    process_direct_sale_document_job,
)
from .issue_plan_service import plan_issue_allocations
from .operational_error_map import map_complete_exception
from .order_service import create_order_from_session
from .payment_service import orchestrate_direct_sale_payment
from .errors import DirectSaleError
from .constants import SUSPEND_TTL_MINUTES, reservation_expires_at
from .stock_issue_service import create_reservations_for_order, issue_stock_for_allocations
from ..operational_features_context import build_operational_features_context
from ..operational_observability import log_direct_sale_complete
from ..operational_sales_events import emit_operational_sales_event

logger = logging.getLogger(__name__)

_COMPLETABLE_STATUSES = frozenset({"ACTIVE", "CHECKOUT", "SUSPENDED", "COMPLETING"})

_complete_schema_ready = False


def _positive_int(value: object | None) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    return value if value > 0 else None


def try_idempotent_complete_result(
    db: Session,
    sess: DirectSaleSession,
) -> DirectSaleCompleteResult | None:
    """
    Safe replay when complete already persisted (duplicate request / commit race).
    Repairs session row when payment+order exist but status was not finalized.
    """
    sid = int(sess.id)
    tid = int(sess.tenant_id)

    payment = (
        db.query(Payment)
        .filter(
            Payment.direct_sale_session_id == sid,
            Payment.tenant_id == tid,
        )
        .order_by(Payment.id.desc())
        .first()
    )

    order_id = _positive_int(getattr(sess, "order_id", None))
    pay_id = _positive_int(getattr(payment, "id", None)) if payment is not None else None
    if payment is not None and pay_id is not None:
        order_id = order_id or _positive_int(getattr(payment, "order_id", None))
    else:
        payment = None

    if order_id is None:
        return None

    order = (
        db.query(Order)
        .filter(Order.id == int(order_id), Order.tenant_id == tid)
        .first()
    )
    if order is None or _positive_int(getattr(order, "id", None)) != order_id:
        return None

    pay = payment
    if pay is None:
        pay = (
            db.query(Payment)
            .filter(Payment.order_id == int(order_id), Payment.tenant_id == tid)
            .order_by(Payment.id.desc())
            .first()
        )
    pay_id = _positive_int(getattr(pay, "id", None)) if pay is not None else None
    if pay is None or pay_id is None:
        return None

    if sess.status != "COMPLETED" or _positive_int(getattr(sess, "order_id", None)) != order_id:
        from_status = str(sess.status or "")
        now = datetime.utcnow()
        sess.status = "COMPLETED"
        sess.order_id = int(order_id)
        if getattr(sess, "completed_at", None) is None:
            sess.completed_at = now
        sess.last_activity_at = now
        sess.expires_at = None
        db.flush()
        log_session_state_transition(
            session_id=sid,
            from_status=from_status,
            to_status="COMPLETED",
            stage="idempotent_repair",
        )

    doc_job = (
        db.query(DocumentGenerationJob)
        .filter(
            DocumentGenerationJob.session_id == sid,
            DocumentGenerationJob.tenant_id == tid,
        )
        .order_by(DocumentGenerationJob.id.desc())
        .first()
    )
    doc_number = get_job_document_number(doc_job) if doc_job else None
    if not doc_number:
        doc_number = str(getattr(order, "sales_document_number", None) or "") or None

    total = round(float(order.value or 0), 2) if order.value is not None else _session_total(sess)

    logger.info(
        "[direct_sales.complete] idempotent_hit session_id=%s order_id=%s payment_id=%s",
        sid,
        order_id,
        int(pay.id),
    )
    job_id = _positive_int(getattr(doc_job, "id", None)) if doc_job is not None else None
    return DirectSaleCompleteResult(
        session_id=sid,
        order_id=int(order_id),
        payment_id=int(pay_id),
        document_job_id=job_id,
        document_number=doc_number,
        total_amount=total,
        payment_status=str(getattr(pay, "status", None) or "") or None,
        payment_method=str(getattr(pay, "method", None) or "") or None,
        document_warning=None,
    )


def _ensure_direct_sale_complete_schema() -> None:
    """Idempotent schema guard — tier1 migrations may still be running at first complete."""
    global _complete_schema_ready
    if _complete_schema_ready:
        return
    from ...database import engine
    from ...db.schema_upgrade import (
        ensure_direct_sales_settings_table,
        ensure_operational_sales_phase2_schema,
        ensure_operational_sales_phase3_schema,
    )

    ensure_direct_sales_settings_table(engine)
    ensure_operational_sales_phase2_schema(engine)
    ensure_operational_sales_phase3_schema(engine)
    _complete_schema_ready = True


@dataclass
class DirectSaleCompleteResult:
    session_id: int
    order_id: int
    payment_id: int
    document_job_id: int | None
    document_number: str | None
    total_amount: float
    payment_status: str | None = None
    payment_method: str | None = None
    document_warning: str | None = None


def _session_total(sess: DirectSaleSession) -> float:
    total = 0.0
    for ln in sess.lines or []:
        qty = float(ln.quantity or 0)
        unit = float(ln.unit_price) if ln.unit_price is not None else 0.0
        disc = float(ln.discount_amount or 0)
        total += max(0.0, unit * qty - disc)
    return round(total, 2)


def start_direct_sale_payment(
    db: Session,
    sess: DirectSaleSession,
    *,
    payment_method: str = "CASH",
    performed_by_user_id: int | None = None,
) -> DirectSaleSession:
    if sess.status not in ("ACTIVE", "SUSPENDED"):
        raise DirectSaleError("Sesja nie może rozpocząć płatności.", code="SESSION_INVALID")
    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="SESSION_INVALID")
    ctx = {
        "method": (payment_method or "CASH").strip().upper(),
        "amount": _session_total(sess),
        "started_at": datetime.utcnow().isoformat(),
    }
    sess.payment_context_json = json.dumps(ctx, ensure_ascii=False)
    sess.status = "CHECKOUT"
    sess.suspended_at = None
    sess.expires_at = reservation_expires_at(minutes=SUSPEND_TTL_MINUTES)
    sess.last_activity_at = datetime.utcnow()
    emit_operational_sales_event(
        db,
        "direct_sale.checkout_started",
        tenant_id=int(sess.tenant_id),
        warehouse_id=int(sess.warehouse_id),
        session_id=int(sess.id),
        source="direct_sales",
        performed_by_user_id=performed_by_user_id,
        device_id=int(sess.workstation_id) if sess.workstation_id else None,
        extra=ctx,
    )
    return sess


def complete_direct_sale_session(
    db: Session,
    sess: DirectSaleSession,
    *,
    payment_method: str = "CASH",
    document_subtype: str = "RECEIPT",
    payment_splits: list[dict] | None = None,
    performed_by_user_id: int | None = None,
) -> DirectSaleCompleteResult:
    sid = int(sess.id)
    logger.info(
        "[direct-sales.complete.start] session_id=%s tenant_id=%s warehouse_id=%s status=%s",
        sid,
        int(sess.tenant_id),
        int(sess.warehouse_id),
        sess.status,
    )
    replay = try_idempotent_complete_result(db, sess)
    if replay is not None:
        return replay

    if sess.status not in _COMPLETABLE_STATUSES:
        raise DirectSaleError("Sesja nie może być zakończona.", code="SESSION_INVALID")
    if sess.order_id is not None:
        replay = try_idempotent_complete_result(db, sess)
        if replay is not None:
            return replay
        raise DirectSaleError("Sesja już zakończona.", code="SESSION_INVALID")
    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="SESSION_INVALID")

    _ensure_direct_sale_complete_schema()

    from_status = str(sess.status or "")
    if from_status != "COMPLETING":
        sess.status = "COMPLETING"
        db.flush()
        log_session_state_transition(
            session_id=sid,
            from_status=from_status,
            to_status="COMPLETING",
            stage="pipeline_enter",
        )

    lines = list(sess.lines or [])
    document_warning: str | None = None
    total_preview = _session_total(sess)
    payment_m = (payment_method or "CASH").strip().upper()
    issue_strategy = str(getattr(sess, "issue_strategy", None) or "STRICT_LOCATION")
    order_status_id: int | None = None
    try:
        ds = resolve_direct_sales_settings(
            db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id)
        )
        order_status_id = ds.resolved.default_order_status_id
    except Exception:
        logger.debug("[direct_sales.complete] settings_load_failed session_id=%s", sid)

    stage_ctx = {
        "payment_method": payment_m,
        "totals": total_preview,
        "order_status": order_status_id,
        "issue_strategy": issue_strategy,
        "line_count": len(lines),
        "document_subtype": document_subtype,
    }
    log_complete_stage(
        session_id=sid,
        stage="pipeline_enter",
        payment_method=payment_m,
        totals=total_preview,
        order_status=order_status_id,
        issue_strategy=issue_strategy,
        extra={"line_count": len(lines), "document_subtype": document_subtype},
    )

    current_step = "create_order"
    try:
        current_step = "create_order"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            order, items_by_line = create_order_from_session(db, sess, lines=lines)

        current_step = "plan_allocations"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            allocations = plan_issue_allocations(db, sess, lines)

        current_step = "reserve_stock"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            reservations = create_reservations_for_order(
                db,
                order=order,
                sess=sess,
                allocations=allocations,
                performed_by_user_id=performed_by_user_id,
            )

        current_step = "issue_stock"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            issue_stock_for_allocations(
                db,
                order=order,
                sess=sess,
                order_items_by_line=items_by_line,
                allocations=allocations,
                reservations=reservations,
                performed_by_user_id=performed_by_user_id,
            )

        total = _session_total(sess)
        current_step = "create_payment"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            pay = orchestrate_direct_sale_payment(
                db,
                order=order,
                sess=sess,
                amount=total,
                method=payment_method,
                payment_splits=payment_splits,
                performed_by_user_id=performed_by_user_id,
            )

        doc_result = None
        processed_number: str | None = None
        current_step = "generate_documents"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            doc_result = enqueue_direct_sale_documents(
                db,
                DirectSaleDocumentRequest(
                    tenant_id=int(sess.tenant_id),
                    warehouse_id=int(sess.warehouse_id),
                    order_id=int(order.id),
                    session_id=int(sess.id),
                    document_subtype=document_subtype,
                    performed_by_user_id=performed_by_user_id,
                    device_id=int(sess.workstation_id) if sess.workstation_id else None,
                ),
            )
            try:
                processed = process_direct_sale_document_job(db, doc_result.job_id)
                processed_number = processed.document_number
                if str(processed.status or "").upper() == "GENERATED":
                    logger.info(
                        "[direct_sales.document] %s",
                        json.dumps(
                            {
                                "session_id": sid,
                                "document_type": str(processed.document_subtype or document_subtype),
                                "document_id": processed.sale_document_id,
                                "order_id": int(order.id),
                                "status": "created",
                                "document_number": processed_number,
                            },
                            ensure_ascii=False,
                        ),
                    )
                if str(processed.status or "").upper() in ("FAILED", "RETRYING") and not processed_number:
                    document_warning = "Dokument zostanie wygenerowany asynchronicznie."
            except Exception as doc_exc:
                document_warning = "Dokument zostanie wygenerowany asynchronicznie."
                logger.warning(
                    "[direct-sales.complete] session_id=%s step=generate_documents soft_fail=%s",
                    sid,
                    doc_exc,
                )

        current_step = "complete_session"
        with log_complete_step(session_id=sid, step=current_step, context=stage_ctx):
            now = datetime.utcnow()
            from_status = str(sess.status or "COMPLETING")
            sess.status = "COMPLETED"
            sess.order_id = int(order.id)
            sess.completed_at = now
            sess.last_activity_at = now
            sess.expires_at = None
            log_session_state_transition(
                session_id=sid,
                from_status=from_status,
                to_status="COMPLETED",
                stage="complete_session",
            )

            emit_operational_sales_event(
                db,
                "direct_sale.completed",
                tenant_id=int(sess.tenant_id),
                warehouse_id=int(sess.warehouse_id),
                order_id=int(order.id),
                session_id=int(sess.id),
                source="direct_sales",
                performed_by_user_id=performed_by_user_id,
                device_id=int(sess.workstation_id) if sess.workstation_id else None,
                extra={
                    "payment_id": int(pay.id),
                    "document_job_id": doc_result.job_id if doc_result else None,
                    "document_number": processed_number,
                    "total_amount": total,
                },
            )

        db.flush()
        feat = build_operational_features_context(
            db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id)
        )
        log_direct_sale_complete(
            session_id=sid,
            order_id=int(order.id),
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            payment_id=int(pay.id),
            total_amount=total,
            features=feat.as_log_dict(),
        )
        return DirectSaleCompleteResult(
            session_id=sid,
            order_id=int(order.id),
            payment_id=int(pay.id),
            document_job_id=doc_result.job_id if doc_result else None,
            document_number=processed_number,
            total_amount=total,
            payment_status=str(getattr(pay, "status", None) or "") or None,
            payment_method=str(getattr(pay, "method", None) or "") or None,
            document_warning=document_warning,
        )
    except Exception as exc:
        log_direct_sale_complete(
            session_id=sid,
            order_id=int(sess.order_id) if sess.order_id else None,
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            status="error",
            error=str(exc),
        )
        raise map_complete_exception(exc, step=current_step) from exc
