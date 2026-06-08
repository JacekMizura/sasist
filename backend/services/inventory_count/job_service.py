"""Background jobs for inventory reports and audit packages."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.job import (
    JOB_COMPLETED,
    JOB_FAILED,
    JOB_KIND_AUDIT_PACKAGE,
    JOB_KIND_REPORT,
    JOB_PENDING,
    JOB_PROCESSING,
    InventoryJob,
)
from ...models.inventory_count.constants import REPORT_FORMAT_XLSX
from .audit_package_service import build_audit_package
from .errors import InventoryCountError
from .observability import log_inventory_structured, observe_duration
from .report_service import generate_inventory_report

logger = logging.getLogger(__name__)

# Threshold above which exports should be queued instead of inline
ASYNC_EXPORT_LINE_THRESHOLD = 5000


def enqueue_inventory_job(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    job_kind: str,
    payload: dict[str, Any],
    user_id: int | None = None,
    idempotency_key: str | None = None,
) -> InventoryJob:
    if idempotency_key:
        existing = (
            db.query(InventoryJob)
            .filter(InventoryJob.idempotency_key == str(idempotency_key))
            .first()
        )
        if existing is not None:
            return existing

    job = InventoryJob(
        tenant_id=int(tenant_id),
        inventory_document_id=int(document_id),
        job_kind=str(job_kind),
        status=JOB_PENDING,
        payload_json=json.dumps(payload, ensure_ascii=False, default=str),
        requested_by_user_id=user_id,
        idempotency_key=idempotency_key,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    log_inventory_structured("job.enqueued", job_id=int(job.id), kind=job_kind, document_id=document_id)
    return job


def get_inventory_job(db: Session, *, tenant_id: int, job_id: int) -> dict[str, Any]:
    job = (
        db.query(InventoryJob)
        .filter(InventoryJob.id == int(job_id), InventoryJob.tenant_id == int(tenant_id))
        .first()
    )
    if job is None:
        raise InventoryCountError(f"Job {job_id} not found", code="job_not_found")
    return _job_to_dict(job)


def process_inventory_job(db: Session, job: InventoryJob) -> InventoryJob:
    now = datetime.utcnow()
    job.status = JOB_PROCESSING
    job.started_at = now
    job.attempt_count = int(job.attempt_count or 0) + 1
    job.progress_percent = 5
    db.flush()

    try:
        payload = json.loads(job.payload_json or "{}")
        document_id = int(job.inventory_document_id or payload.get("document_id") or 0)
        tenant_id = int(job.tenant_id)

        with observe_duration("export_duration_ms_total", event="job.export", job_id=int(job.id), kind=job.job_kind):
            if job.job_kind == JOB_KIND_REPORT:
                result = generate_inventory_report(
                    db,
                    tenant_id=tenant_id,
                    document_id=document_id,
                    report_kind=str(payload.get("report_kind") or "differences"),
                    report_format=str(payload.get("format") or REPORT_FORMAT_XLSX),
                    user_id=job.requested_by_user_id,
                )
                job.result_json = json.dumps(
                    {"file_name": result["file_name"], "media_type": result["media_type"], "size": len(result["content"])},
                    ensure_ascii=False,
                )
                # Store base64 in result for small jobs — production would use object storage
                import base64

                job.result_json = json.dumps(
                    {
                        "file_name": result["file_name"],
                        "media_type": result["media_type"],
                        "content_base64": base64.b64encode(result["content"]).decode("ascii"),
                    },
                    ensure_ascii=False,
                )
            elif job.job_kind == JOB_KIND_AUDIT_PACKAGE:
                result = build_audit_package(
                    db,
                    tenant_id=tenant_id,
                    document_id=document_id,
                    user_id=job.requested_by_user_id,
                )
                import base64

                job.result_json = json.dumps(
                    {
                        "file_name": result["file_name"],
                        "media_type": "application/zip",
                        "content_base64": base64.b64encode(result["content"]).decode("ascii"),
                    },
                    ensure_ascii=False,
                )
            else:
                raise InventoryCountError(f"Unknown job kind: {job.job_kind}", code="unknown_job_kind")

        job.status = JOB_COMPLETED
        job.progress_percent = 100
        job.completed_at = datetime.utcnow()
        job.error_message = None
    except Exception as exc:
        logger.exception("[inventory.job] failed job_id=%s", job.id)
        job.status = JOB_FAILED
        job.error_message = str(exc)[:2000]
        job.completed_at = datetime.utcnow()
        if int(job.attempt_count or 0) < int(job.max_attempts or 3):
            job.next_retry_at = datetime.utcnow() + timedelta(minutes=2 * int(job.attempt_count or 1))
    db.commit()
    db.refresh(job)
    return job


def process_pending_inventory_jobs(db: Session, *, limit: int = 10) -> int:
    jobs = (
        db.query(InventoryJob)
        .filter(InventoryJob.status == JOB_PENDING)
        .order_by(InventoryJob.id.asc())
        .limit(limit)
        .all()
    )
    for job in jobs:
        process_inventory_job(db, job)
    return len(jobs)


def _job_to_dict(job: InventoryJob) -> dict[str, Any]:
    result = None
    if job.result_json:
        try:
            result = json.loads(job.result_json)
        except json.JSONDecodeError:
            result = {"raw": job.result_json}
    return {
        "id": job.id,
        "tenant_id": job.tenant_id,
        "inventory_document_id": job.inventory_document_id,
        "job_kind": job.job_kind,
        "status": job.status,
        "progress_percent": job.progress_percent,
        "attempt_count": job.attempt_count,
        "error_message": job.error_message,
        "result": result,
        "created_at": job.created_at.isoformat() if job.created_at else None,
        "completed_at": job.completed_at.isoformat() if job.completed_at else None,
    }
