"""Atomic direct sale completion — order-first transactional pipeline."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from .complete_pipeline_log import log_complete_stage, log_complete_step
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
    if sess.status not in ("ACTIVE", "CHECKOUT", "SUSPENDED"):
        raise DirectSaleError("Sesja nie może być zakończona.", code="SESSION_INVALID")
    if sess.order_id is not None:
        raise DirectSaleError("Sesja już zakończona.", code="SESSION_INVALID")
    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="SESSION_INVALID")

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
            sess.status = "COMPLETED"
            sess.order_id = int(order.id)
            sess.completed_at = now
            sess.last_activity_at = now
            sess.expires_at = None

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
