"""Print job admin — list, detail, retry, cancel, soft delete."""

from __future__ import annotations

import json
import shutil
from datetime import datetime
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import (
    CANCELLABLE_JOB_STATUSES,
    JOB_STATUS_CANCELLED,
    JOB_STATUS_PENDING,
    RETRYABLE_JOB_STATUSES,
)
from ...models.printing.print_job import PrintJob
from ...models.printing.printer_agent import PrinterAgent
from .errors import JobTransitionConflictError, PrintJobNotFoundError, PrintingError
from .file_service import job_pdf_path
from .queue_service import build_job_file_url
from .job_service import _parse_payload_json


def _duration_seconds(job: PrintJob) -> int | None:
    if job.started_at is None or job.finished_at is None:
        return None
    delta = job.finished_at - job.started_at
    return max(0, int(delta.total_seconds()))


def _find_root_job_id(db: Session, job: PrintJob) -> int:
    current = job
    seen: set[int] = set()
    while current.parent_job_id and current.parent_job_id not in seen:
        seen.add(current.id)
        parent = db.query(PrintJob).filter(PrintJob.id == current.parent_job_id).first()
        if parent is None:
            break
        current = parent
    return current.id


def _retry_count(db: Session, job: PrintJob) -> int:
    root_id = _find_root_job_id(db, job)
    chain_ids = {root_id}
    while True:
        children = (
            db.query(PrintJob.id)
            .filter(PrintJob.parent_job_id.in_(chain_ids), PrintJob.deleted_at.is_(None))
            .all()
        )
        new_ids = {row.id for row in children} - chain_ids
        if not new_ids:
            break
        chain_ids |= new_ids
    return len(chain_ids)


def _load_job_for_tenant(db: Session, *, tenant_id: int, job_id: int) -> PrintJob:
    job = (
        db.query(PrintJob)
        .options(
            joinedload(PrintJob.printer).joinedload(AgentPrinter.agent),
            joinedload(PrintJob.parent_job),
        )
        .filter(
            PrintJob.id == job_id,
            PrintJob.tenant_id == tenant_id,
            PrintJob.deleted_at.is_(None),
        )
        .first()
    )
    if job is None:
        raise PrintJobNotFoundError("Print job not found")
    return job


def _serialize_job_row(job: PrintJob, *, retry_count: int | None = None) -> dict[str, Any]:
    printer = job.printer
    agent = printer.agent if printer else None
    return {
        "id": job.id,
        "tenant_id": job.tenant_id,
        "warehouse_id": job.warehouse_id,
        "printer_id": job.printer_id,
        "printer_name": printer.name if printer else None,
        "agent_id": agent.id if agent else None,
        "agent_name": agent.name if agent else None,
        "machine_id": agent.machine_id if agent else None,
        "document_type": job.document_type,
        "document_id": job.document_id,
        "payload_json": _parse_payload_json(job.payload_json),
        "status": job.status,
        "error_message": job.error_message,
        "copies": job.copies,
        "parent_job_id": job.parent_job_id,
        "retry_number": job.retry_number,
        "source_module": job.source_module,
        "job_type": job.job_type,
        "created_at": job.created_at,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "duration_seconds": _duration_seconds(job),
        "retry_count": retry_count,
    }


def _serialize_job_detail(db: Session, job: PrintJob) -> dict[str, Any]:
    data = _serialize_job_row(job, retry_count=_retry_count(db, job))
    parent = job.parent_job
    data["parent_job"] = (
        {
            "id": parent.id,
            "status": parent.status,
            "retry_number": parent.retry_number,
            "created_at": parent.created_at,
        }
        if parent is not None
        else None
    )
    return data


def list_print_jobs(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    status: str | None = None,
    search: str | None = None,
    limit: int = 200,
) -> list[dict[str, Any]]:
    query = (
        db.query(PrintJob)
        .options(joinedload(PrintJob.printer).joinedload(AgentPrinter.agent))
        .filter(
            PrintJob.tenant_id == tenant_id,
            PrintJob.deleted_at.is_(None),
        )
    )
    if warehouse_id is not None:
        query = query.filter(PrintJob.warehouse_id == warehouse_id)
    if status:
        query = query.filter(PrintJob.status == status.strip().lower())

    if search:
        term = search.strip()
        if term:
            filters = []
            if term.isdigit():
                filters.append(PrintJob.id == int(term))
                filters.append(PrintJob.document_id == int(term))
            filters.append(AgentPrinter.name.ilike(f"%{term}%"))
            query = query.outerjoin(AgentPrinter, PrintJob.printer_id == AgentPrinter.id).filter(
                or_(*filters),
            )

    rows = query.order_by(PrintJob.created_at.desc()).limit(max(1, min(limit, 500))).all()
    return [_serialize_job_row(row) for row in rows]


def list_jobs_by_document(
    db: Session,
    *,
    tenant_id: int,
    document_type: str,
    document_id: int,
    warehouse_id: int | None = None,
) -> list[dict[str, Any]]:
    doc_type = document_type.strip().lower()
    query = (
        db.query(PrintJob)
        .options(joinedload(PrintJob.printer).joinedload(AgentPrinter.agent))
        .filter(
            PrintJob.tenant_id == tenant_id,
            PrintJob.deleted_at.is_(None),
            PrintJob.document_type == doc_type,
            PrintJob.document_id == document_id,
        )
    )
    if warehouse_id is not None:
        query = query.filter(PrintJob.warehouse_id == warehouse_id)

    rows = query.order_by(PrintJob.created_at.desc()).all()
    return [_serialize_job_row(row) for row in rows]


def get_print_job(db: Session, *, tenant_id: int, job_id: int) -> dict[str, Any]:
    job = _load_job_for_tenant(db, tenant_id=tenant_id, job_id=job_id)
    return _serialize_job_detail(db, job)


def _copy_parent_pdf(parent_job_id: int, new_job_id: int) -> None:
    src = job_pdf_path(parent_job_id)
    if not src.is_file():
        return
    dst = job_pdf_path(new_job_id)
    shutil.copy2(src, dst)


def retry_print_job(
    db: Session,
    *,
    tenant_id: int,
    job_id: int,
    api_base_url: str,
) -> PrintJob:
    parent = _load_job_for_tenant(db, tenant_id=tenant_id, job_id=job_id)
    if parent.status not in RETRYABLE_JOB_STATUSES:
        raise JobTransitionConflictError(
            f"Job {job_id} cannot be retried (status: {parent.status})",
        )

    retry_number = int(parent.retry_number or 0) + 1
    payload = _parse_payload_json(parent.payload_json)
    copies = int(payload.get("copies") or parent.copies or 1)

    child = PrintJob(
        tenant_id=parent.tenant_id,
        warehouse_id=parent.warehouse_id,
        printer_id=parent.printer_id,
        document_type=parent.document_type,
        document_id=parent.document_id,
        payload_json=json.dumps({"pdf_url": "pending", "copies": copies}, ensure_ascii=False),
        status=JOB_STATUS_PENDING,
        copies=copies,
        parent_job_id=parent.id,
        retry_number=retry_number,
        source_module=parent.source_module,
        job_type=parent.job_type,
        created_at=datetime.utcnow(),
    )
    db.add(child)
    db.flush()

    _copy_parent_pdf(parent.id, child.id)
    file_url = build_job_file_url(api_base_url=api_base_url, job_id=child.id)
    child.payload_json = json.dumps({"pdf_url": file_url, "copies": copies}, ensure_ascii=False)
    db.commit()
    db.refresh(child)
    return child


def cancel_print_job(db: Session, *, tenant_id: int, job_id: int) -> PrintJob:
    job = _load_job_for_tenant(db, tenant_id=tenant_id, job_id=job_id)
    if job.status not in CANCELLABLE_JOB_STATUSES:
        raise JobTransitionConflictError(
            f"Job {job_id} cannot be cancelled (status: {job.status})",
        )

    now = datetime.utcnow()
    job.status = JOB_STATUS_CANCELLED
    if job.started_at is None:
        job.started_at = now
    job.finished_at = now
    db.commit()
    db.refresh(job)
    return job


def soft_delete_print_job(db: Session, *, tenant_id: int, job_id: int) -> PrintJob:
    job = _load_job_for_tenant(db, tenant_id=tenant_id, job_id=job_id)
    if job.deleted_at is not None:
        raise PrintingError("Print job already deleted", status_code=409)

    job.deleted_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job
