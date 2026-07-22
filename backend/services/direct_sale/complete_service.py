"""Direct sale completion — staged idempotent pipeline entry point."""

from __future__ import annotations

import logging
import traceback
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, Payment
from ...models.document_generation_job import DocumentGenerationJob
from ...models.order import Order
from ...workers.document_generation_worker import get_job_document_number
from .complete_pipeline_log import log_session_state_transition
from .constants import SUSPEND_TTL_MINUTES, reservation_expires_at
from .errors import DirectSaleError
from .complete_debug_log import log_unhandled_complete_exception, rollback_db_safely
from .pipeline_orchestrator import run_staged_complete_pipeline
from .pipeline_state import (
    PIPELINE_COMPLETED,
    PIPELINE_PAYMENT_STARTED,
    infer_pipeline_status_from_session,
    load_pipeline_entities,
)
from ..operational_sales_events import emit_operational_sales_event

logger = logging.getLogger(__name__)


def _positive_int(value: object | None) -> int | None:
    if not isinstance(value, int) or isinstance(value, bool):
        return None
    return value if value > 0 else None


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
    pipeline_status: str | None = None
    failed_stage: str | None = None
    recoverable: bool = False


def _session_total(db: Session, sess: DirectSaleSession) -> float:
    from ..sale_document_financials import compute_direct_sale_session_total

    return compute_direct_sale_session_total(
        list(sess.lines or []),
        db=db,
        tenant_id=int(sess.tenant_id),
        session=sess,
    )


def try_idempotent_complete_result(
    db: Session,
    sess: DirectSaleSession,
) -> DirectSaleCompleteResult | None:
    """Safe replay when completion already persisted or resumable partial state exists."""
    sid = int(sess.id)
    tid = int(sess.tenant_id)
    pipeline = infer_pipeline_status_from_session(sess)

    if pipeline != PIPELINE_COMPLETED and str(sess.status or "").upper() != "COMPLETED":
        entities = load_pipeline_entities(sess)
        if not entities.get("order_id") or not entities.get("payment_id"):
            return None

    payment = (
        db.query(Payment)
        .filter(Payment.direct_sale_session_id == sid, Payment.tenant_id == tid)
        .order_by(Payment.id.desc())
        .first()
    )
    order_id = _positive_int(getattr(sess, "order_id", None))
    if payment is not None:
        order_id = order_id or _positive_int(getattr(payment, "order_id", None))
    if order_id is None:
        order_id = _positive_int(load_pipeline_entities(sess).get("order_id"))
    if order_id is None:
        return None

    order = db.query(Order).filter(Order.id == int(order_id), Order.tenant_id == tid).first()
    if order is None:
        return None

    pay = payment or (
        db.query(Payment)
        .filter(Payment.order_id == int(order_id), Payment.tenant_id == tid)
        .order_by(Payment.id.desc())
        .first()
    )
    if pay is None:
        return None

    if pipeline == PIPELINE_COMPLETED or str(sess.status or "").upper() == "COMPLETED":
        if str(sess.status or "").upper() != "COMPLETED":
            from_status = str(sess.status or "")
            now = datetime.utcnow()
            sess.status = "COMPLETED"
            sess.order_id = int(order_id)
            sess.pipeline_status = PIPELINE_COMPLETED
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
        .filter(DocumentGenerationJob.session_id == sid, DocumentGenerationJob.tenant_id == tid)
        .order_by(DocumentGenerationJob.id.desc())
        .first()
    )
    entities = load_pipeline_entities(sess)
    doc_number = entities.get("document_number") or (
        get_job_document_number(doc_job) if doc_job else None
    )
    if not doc_number:
        doc_number = str(getattr(order, "sales_document_number", None) or "") or None

    total = round(float(order.value or 0), 2) if order.value is not None else _session_total(db, sess)
    job_id = _positive_int(getattr(doc_job, "id", None)) if doc_job else _positive_int(entities.get("document_job_id"))

    return DirectSaleCompleteResult(
        session_id=sid,
        order_id=int(order_id),
        payment_id=int(pay.id),
        document_job_id=job_id,
        document_number=str(doc_number) if doc_number else None,
        total_amount=total,
        payment_status=str(getattr(pay, "status", None) or "") or None,
        payment_method=str(getattr(pay, "method", None) or "") or None,
        document_warning=str(entities.get("document_warning") or "") or None,
        pipeline_status=PIPELINE_COMPLETED,
        recoverable=False,
    )


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
    import json

    ctx = {
        "method": (payment_method or "CASH").strip().upper(),
        "amount": _session_total(db, sess),
        "started_at": datetime.utcnow().isoformat(),
    }
    sess.payment_context_json = json.dumps(ctx, ensure_ascii=False)
    sess.status = "CHECKOUT"
    sess.pipeline_status = PIPELINE_PAYMENT_STARTED
    sess.pipeline_failed_stage = None
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
    tid = int(sess.tenant_id)
    wid = int(sess.warehouse_id)
    logger.info(
        "[direct-sales.complete.start] session_id=%s tenant_id=%s warehouse_id=%s status=%s pipeline=%s",
        sid,
        tid,
        wid,
        sess.status,
        infer_pipeline_status_from_session(sess),
    )

    replay = try_idempotent_complete_result(db, sess)
    if replay is not None and infer_pipeline_status_from_session(sess) == PIPELINE_COMPLETED:
        return replay

    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="empty_session")

    doc_sub = str(document_subtype or getattr(sess, "document_subtype", None) or "RECEIPT").strip().upper()
    if doc_sub == "PA":
        doc_sub = "RECEIPT"
    elif doc_sub == "FV":
        doc_sub = "INVOICE"
    if doc_sub in ("FV", "INVOICE"):
        from ...models.customer import Customer
        from .retail_customer_service import is_retail_system_customer

        cust = (
            db.query(Customer).filter(Customer.id == int(sess.customer_id)).first()
            if getattr(sess, "customer_id", None)
            else None
        )
        if cust is None or is_retail_system_customer(cust):
            raise DirectSaleError(
                "Faktura wymaga klienta firmowego z NIP.",
                code="invoice_customer_required",
                http_status=400,
            )
        nip = str(getattr(cust, "nip", None) or "").strip()
        if len(nip.replace("-", "").replace(" ", "")) < 10:
            raise DirectSaleError(
                "Faktura wymaga poprawnego NIP klienta.",
                code="invoice_nip_required",
                http_status=400,
            )

    ui_status = str(sess.status or "").strip().upper()
    if ui_status == "COMPLETED" and infer_pipeline_status_from_session(sess) == PIPELINE_COMPLETED:
        replay = try_idempotent_complete_result(db, sess)
        if replay is not None:
            return replay
        raise DirectSaleError("Sesja już zakończona.", code="already_completed")

    if ui_status not in ("ACTIVE", "CHECKOUT", "SUSPENDED", "FAILED"):
        raise DirectSaleError("Sesja nie może być zakończona.", code="invalid_status")

    from .fulfillment_service import validate_fulfillment_for_complete

    validate_fulfillment_for_complete(sess)

    try:
        entities = run_staged_complete_pipeline(
            db,
            sess,
            payment_method=payment_method,
            document_subtype=doc_sub,
            payment_splits=payment_splits,
            performed_by_user_id=performed_by_user_id,
        )
    except DirectSaleError:
        rollback_db_safely(db, context="complete_service_direct_sale_error")
        raise
    except Exception as exc:
        tb = "".join(traceback.format_exception(type(exc), exc, exc.__traceback__))
        rollback_db_safely(db, context="complete_service_unhandled")
        log_unhandled_complete_exception(
            exc,
            session_id=sid,
            stage="pipeline",
            context="complete_service",
            traceback_str=tb,
        )
        raise

    if not entities.order_id or not entities.payment_id:
        raise DirectSaleError(
            "Pipeline zakończył się bez zamówienia lub płatności.",
            code="pipeline_incomplete",
            step="complete_session",
        )

    pay = db.query(Payment).filter(Payment.id == int(entities.payment_id)).first()
    order = db.query(Order).filter(Order.id == int(entities.order_id)).first()
    total = round(float(order.value or 0), 2) if order and order.value is not None else 0.0

    return DirectSaleCompleteResult(
        session_id=sid,
        order_id=int(entities.order_id),
        payment_id=int(entities.payment_id),
        document_job_id=entities.document_job_id,
        document_number=entities.document_number,
        total_amount=total,
        payment_status=str(getattr(pay, "status", None) or "") or None,
        payment_method=str(getattr(pay, "method", None) or "") or None,
        document_warning=entities.document_warning,
        pipeline_status=PIPELINE_COMPLETED,
        recoverable=False,
    )
