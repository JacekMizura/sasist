"""Atomic direct sale completion — order-first transactional pipeline."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from .document_pipeline_service import (
    DirectSaleDocumentRequest,
    enqueue_direct_sale_documents,
    process_direct_sale_document_job,
)
from .issue_plan_service import plan_issue_allocations
from .order_service import create_order_from_session
from .payment_service import orchestrate_direct_sale_payment
from .errors import DirectSaleError
from .constants import SUSPEND_TTL_MINUTES, reservation_expires_at
from .stock_issue_service import create_reservations_for_order, issue_stock_for_allocations
from ..operational_features_context import build_operational_features_context
from ..operational_observability import log_direct_sale_complete
from ..operational_sales_events import emit_operational_sales_event


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
        raise DirectSaleError("Sesja nie może rozpocząć płatności.", code="invalid_status")
    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="empty_session")
    import json

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
    performed_by_user_id: int | None = None,
) -> DirectSaleCompleteResult:
    if sess.status not in ("ACTIVE", "CHECKOUT", "SUSPENDED"):
        raise DirectSaleError("Sesja nie może być zakończona.", code="invalid_status")
    if sess.order_id is not None:
        raise DirectSaleError("Sesja już zakończona.", code="already_completed")
    if not (sess.lines or []):
        raise DirectSaleError("Sesja nie ma pozycji.", code="empty_session")

    lines = list(sess.lines or [])
    try:
        # 1. Order + OrderItems (anchor)
        order, items_by_line = create_order_from_session(db, sess, lines=lines)

        # 2. Plan issue allocations (issue_strategy)
        allocations = plan_issue_allocations(db, sess, lines)

        # 3. Reservations (before issue)
        reservations = create_reservations_for_order(
            db,
            order=order,
            sess=sess,
            allocations=allocations,
            performed_by_user_id=performed_by_user_id,
        )

        # 4. Issue stock + movements
        issue_stock_for_allocations(
            db,
            order=order,
            sess=sess,
            order_items_by_line=items_by_line,
            allocations=allocations,
            reservations=reservations,
            performed_by_user_id=performed_by_user_id,
        )

        # 5. Payment orchestration
        total = _session_total(sess)
        pay = orchestrate_direct_sale_payment(
            db,
            order=order,
            sess=sess,
            amount=total,
            method=payment_method,
            performed_by_user_id=performed_by_user_id,
        )

        # 6. Document generation pipeline (async job — worker generates, not inline)
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
        processed = process_direct_sale_document_job(db, doc_result.job_id)

        # 7. Complete session
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
                "document_job_id": doc_result.job_id,
                "document_number": processed.document_number,
                "total_amount": total,
            },
        )

        db.flush()
        feat = build_operational_features_context(
            db, tenant_id=int(sess.tenant_id), warehouse_id=int(sess.warehouse_id)
        )
        log_direct_sale_complete(
            session_id=int(sess.id),
            order_id=int(order.id),
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            payment_id=int(pay.id),
            total_amount=total,
            features=feat.as_log_dict(),
        )
        return DirectSaleCompleteResult(
            session_id=int(sess.id),
            order_id=int(order.id),
            payment_id=int(pay.id),
            document_job_id=doc_result.job_id,
            document_number=processed.document_number,
            total_amount=total,
            payment_status=str(pay.status or "") or None,
            payment_method=str(pay.method or "") or None,
        )
    except Exception as exc:
        log_direct_sale_complete(
            session_id=int(sess.id),
            order_id=int(sess.order_id) if sess.order_id else None,
            tenant_id=int(sess.tenant_id),
            warehouse_id=int(sess.warehouse_id),
            status="error",
            error=str(exc),
        )
        raise
