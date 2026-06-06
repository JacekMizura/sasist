"""Direct sale session history — completed sales for terminal + ops."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession, Payment
from ...models.document_generation_job import DocumentGenerationJob
from ...models.order import Order
from .completion_read_service import _operator_label


def list_direct_sale_history(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    today_only: bool = False,
    operator_user_id: int | None = None,
    workstation_id: int | None = None,
    limit: int = 30,
) -> list[dict]:
    lim = max(1, min(int(limit), 100))
    q = (
        db.query(DirectSaleSession)
        .filter(
            DirectSaleSession.tenant_id == int(tenant_id),
            DirectSaleSession.warehouse_id == int(warehouse_id),
            DirectSaleSession.status == "COMPLETED",
        )
        .order_by(DirectSaleSession.completed_at.desc(), DirectSaleSession.id.desc())
    )
    if today_only:
        start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        q = q.filter(DirectSaleSession.completed_at >= start)
    if operator_user_id is not None:
        q = q.filter(DirectSaleSession.operator_user_id == int(operator_user_id))
    if workstation_id is not None:
        q = q.filter(DirectSaleSession.workstation_id == int(workstation_id))

    rows = q.limit(lim).all()
    out: list[dict] = []
    for sess in rows:
        order = None
        if sess.order_id:
            order = db.query(Order).filter(Order.id == int(sess.order_id)).first()
        payment = (
            db.query(Payment)
            .filter(Payment.direct_sale_session_id == int(sess.id))
            .order_by(Payment.id.desc())
            .first()
        )
        doc_job = (
            db.query(DocumentGenerationJob)
            .filter(DocumentGenerationJob.session_id == int(sess.id))
            .order_by(DocumentGenerationJob.id.desc())
            .first()
        )
        doc_num = order.sales_document_number if order else None
        if doc_job and not doc_num:
            from ...workers.document_generation_worker import get_job_document_number

            doc_num = get_job_document_number(doc_job)
        out.append(
            {
                "session_id": int(sess.id),
                "order_id": int(sess.order_id) if sess.order_id else None,
                "order_number": str(order.number or "") if order else None,
                "operator_user_id": int(sess.operator_user_id) if sess.operator_user_id else None,
                "operator_label": _operator_label(db, sess.operator_user_id),
                "workstation_id": int(sess.workstation_id) if sess.workstation_id else None,
                "total_amount": float(order.value or 0) if order else 0.0,
                "payment_method": str(payment.method or "") if payment else None,
                "payment_status": str(payment.status or "") if payment else None,
                "document_number": doc_num,
                "document_subtype": str(doc_job.document_subtype or "") if doc_job else None,
                "document_status": str(doc_job.status or "") if doc_job else None,
                "status": str(sess.status),
                "completed_at": sess.completed_at.isoformat() if sess.completed_at else None,
            }
        )
    return out
