"""Process pending document generation jobs."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from backend.models.document_generation_job import (
    JOB_FAILED,
    JOB_GENERATED,
    JOB_PENDING,
    JOB_PROCESSING,
    JOB_RETRYING,
    DocumentGenerationJob,
)
from backend.models.order import Order
from backend.models.sale_document import SaleDocument
from backend.services.documents.fiscal_dispatch_service import dispatch_fiscal_for_document
from backend.services.direct_sale.errors import DirectSaleError
from backend.services.operational_observability import log_document_pipeline
from backend.services.operational_sales_events import emit_operational_sales_event
from backend.services.wms_sale_document_service import create_sale_document

logger = logging.getLogger(__name__)

_PANEL_FOR_SUBTYPE = {
    "RECEIPT": "PARAGON",
    "INVOICE": "INVOICE",
}


def _panel_type_for_subtype(subtype: str) -> str:
    return _PANEL_FOR_SUBTYPE.get(str(subtype or "").strip().upper(), "PARAGON")


def process_document_job(db: Session, job: DocumentGenerationJob) -> DocumentGenerationJob:
    now = datetime.utcnow()
    job.status = JOB_PROCESSING
    job.started_at = now
    job.attempt_count = int(job.attempt_count or 0) + 1
    db.flush()

    try:
        if not job.order_id:
            raise DirectSaleError("Brak order_id w zadaniu dokumentu.", code="missing_order")
        order = db.query(Order).filter(Order.id == int(job.order_id)).first()
        if order is None:
            raise DirectSaleError("Zamówienie nie istnieje.", code="order_not_found", http_status=404)

        series_id = job.series_id
        if not series_id:
            from backend.services.document_number_service import resolve_default_document_series
            from backend.services.document_series_seed_service import ensure_default_document_series

            sub = str(job.document_subtype or "RECEIPT").strip().upper()
            try:
                ensure_default_document_series(db, int(job.tenant_id), int(job.warehouse_id))
            except Exception:
                logger.exception(
                    "[direct_sales.document] ensure series failed job_id=%s",
                    job.id,
                )
            hit = resolve_default_document_series(
                db,
                tenant_id=int(job.tenant_id),
                warehouse_id=int(job.warehouse_id),
                series_type="SALE",
                subtype=sub,
            )
            if hit is not None:
                series_id = str(hit.id)
                job.series_id = series_id
        if not series_id:
            job.status = JOB_FAILED
            job.error_message = "series_not_configured"
            job.completed_at = now
            emit_operational_sales_event(
                db,
                "document.failed",
                tenant_id=int(job.tenant_id),
                warehouse_id=int(job.warehouse_id),
                order_id=int(job.order_id),
                session_id=int(job.session_id) if job.session_id else None,
                source="document_pipeline",
                extra={"job_id": int(job.id), "reason": "series_not_configured"},
            )
            log_document_pipeline(
                action="failed",
                job_id=int(job.id),
                tenant_id=int(job.tenant_id),
                warehouse_id=int(job.warehouse_id),
                order_id=int(job.order_id),
                status=JOB_FAILED,
                error="series_not_configured",
            )
            return job

        panel = _panel_type_for_subtype(job.document_subtype)
        doc: SaleDocument = create_sale_document(
            db,
            order=order,
            series_id=str(series_id),
            tenant_id=int(job.tenant_id),
            warehouse_id=int(job.warehouse_id),
            panel_document_type=panel,
        )
        fiscal = dispatch_fiscal_for_document(db, job=job, sale_document=doc)
        doc_number = str(getattr(order, "sales_document_number", None) or "")
        result = {
            "sale_document_id": str(doc.id),
            "document_number": doc_number,
            "fiscal_status": fiscal.status,
            "fiscal_ref": fiscal.fiscal_ref,
        }
        job.sale_document_id = str(doc.id)
        job.result_json = json.dumps(result, ensure_ascii=False)
        job.status = JOB_GENERATED
        job.completed_at = datetime.utcnow()
        job.error_message = None

        emit_operational_sales_event(
            db,
            "document.generated",
            tenant_id=int(job.tenant_id),
            warehouse_id=int(job.warehouse_id),
            order_id=int(job.order_id),
            session_id=int(job.session_id) if job.session_id else None,
            source="document_pipeline",
            extra={"job_id": int(job.id), **result},
        )
        log_document_pipeline(
            action="generated",
            job_id=int(job.id),
            tenant_id=int(job.tenant_id),
            warehouse_id=int(job.warehouse_id),
            order_id=int(job.order_id),
            status=JOB_GENERATED,
            document_number=doc_number,
        )
        logger.info(
            "[direct_sales.document] %s",
            json.dumps(
                {
                    "session_id": int(job.session_id) if job.session_id else None,
                    "document_type": str(job.document_subtype or ""),
                    "document_id": str(doc.id),
                    "order_id": int(job.order_id),
                    "status": "created",
                    "document_number": doc_number,
                },
                ensure_ascii=False,
            ),
        )
    except Exception as exc:
        job.error_message = str(exc)[:500]
        if int(job.attempt_count or 0) >= int(job.max_attempts or 3):
            job.status = JOB_FAILED
            job.completed_at = datetime.utcnow()
            emit_operational_sales_event(
                db,
                "document.failed",
                tenant_id=int(job.tenant_id),
                warehouse_id=int(job.warehouse_id),
                order_id=int(job.order_id) if job.order_id else None,
                session_id=int(job.session_id) if job.session_id else None,
                source="document_pipeline",
                extra={"job_id": int(job.id), "error": job.error_message},
            )
        else:
            job.status = JOB_RETRYING
            job.next_retry_at = datetime.utcnow() + timedelta(minutes=2 ** int(job.attempt_count or 1))
        log_document_pipeline(
            action="failed",
            job_id=int(job.id),
            tenant_id=int(job.tenant_id),
            warehouse_id=int(job.warehouse_id),
            order_id=int(job.order_id) if job.order_id else None,
            status=job.status,
            error=job.error_message,
        )
    return job


def process_pending_document_jobs(db: Session, *, limit: int = 10) -> int:
    now = datetime.utcnow()
    q = (
        db.query(DocumentGenerationJob)
        .filter(
            DocumentGenerationJob.status.in_((JOB_PENDING, JOB_RETRYING)),
        )
        .order_by(DocumentGenerationJob.created_at.asc())
        .limit(int(limit))
    )
    rows = q.all()
    processed = 0
    for job in rows:
        if job.status == JOB_RETRYING and job.next_retry_at and job.next_retry_at > now:
            continue
        process_document_job(db, job)
        processed += 1
    return processed


def get_job_document_number(job: DocumentGenerationJob) -> str | None:
    if not job.result_json:
        return None
    try:
        data = json.loads(job.result_json)
        return data.get("document_number")
    except (json.JSONDecodeError, TypeError):
        return None
