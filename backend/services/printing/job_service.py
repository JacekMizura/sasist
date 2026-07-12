"""Print job lifecycle — create, poll, claim, complete, fail."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import (
    JOB_STATUS_CANCELLED,
    JOB_STATUS_FAILED,
    JOB_STATUS_PENDING,
    JOB_STATUS_PRINTED,
    JOB_STATUS_PROCESSING,
    JOB_TYPE_LABEL,
    JOB_TYPE_PDF,
    SOURCE_MODULE_DOCUMENTS,
    SOURCE_MODULE_LABELS,
    SOURCE_MODULE_WAREHOUSE,
)
from ...models.printing.print_job import PrintJob
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.printing.job import PrintJobCreateRequest
from .constants import ALLOWED_JOB_TRANSITIONS
from .errors import JobTransitionConflictError, PrintJobNotFoundError, PrinterNotFoundError, TenantScopeError
from .printer_service import _get_agent_printer_for_tenant


def _parse_payload_json(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _assert_transition(current: str, target: str) -> None:
    allowed = ALLOWED_JOB_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise JobTransitionConflictError(
            f"Invalid job transition: {current} -> {target}",
        )


def create_print_job(
    db: Session,
    *,
    tenant_id: int,
    payload: PrintJobCreateRequest,
    copies: int | None = None,
    source_module: str | None = None,
    job_type: str | None = None,
    parent_job_id: int | None = None,
    retry_number: int = 0,
) -> PrintJob:
    printer = _get_agent_printer_for_tenant(db, tenant_id=tenant_id, printer_id=payload.printer_id)
    if not printer.is_active:
        raise PrinterNotFoundError("Printer is inactive")

    payload_data = payload.payload.model_dump()
    resolved_copies = copies if copies is not None else int(payload_data.get("copies") or 1)

    job = PrintJob(
        tenant_id=tenant_id,
        warehouse_id=payload.warehouse_id if payload.warehouse_id is not None else printer.agent.warehouse_id,
        printer_id=printer.id,
        document_type=payload.document_type.strip(),
        document_id=payload.document_id,
        payload_json=json.dumps(payload_data, ensure_ascii=False),
        status=JOB_STATUS_PENDING,
        copies=max(1, resolved_copies),
        parent_job_id=parent_job_id,
        retry_number=retry_number,
        source_module=source_module or SOURCE_MODULE_WAREHOUSE,
        job_type=job_type or JOB_TYPE_PDF,
        created_at=datetime.utcnow(),
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def _job_belongs_to_agent(job: PrintJob, agent: PrinterAgent) -> bool:
    return job.printer is not None and job.printer.agent_id == agent.id


def list_pending_jobs_for_agent(db: Session, agent: PrinterAgent) -> tuple[list[dict[str, Any]], list[int]]:
    printer_ids = [
        row.id
        for row in db.query(AgentPrinter.id)
        .filter(
            AgentPrinter.agent_id == agent.id,
            AgentPrinter.is_active.is_(True),
        )
        .all()
    ]
    if not printer_ids:
        return [], []

    jobs = (
        db.query(PrintJob)
        .options(joinedload(PrintJob.printer))
        .filter(
            PrintJob.printer_id.in_(printer_ids),
            PrintJob.status == JOB_STATUS_PENDING,
            PrintJob.deleted_at.is_(None),
        )
        .order_by(PrintJob.created_at.asc())
        .all()
    )
    payload = [
        {
            "id": job.id,
            "printer_id": job.printer_id,
            "system_name": job.printer.system_name if job.printer else "",
            "document_type": job.document_type,
            "document_id": job.document_id,
            "payload": _parse_payload_json(job.payload_json),
        }
        for job in jobs
    ]
    return payload, printer_ids


def _load_job_for_agent(db: Session, *, job_id: int, agent: PrinterAgent) -> PrintJob:
    job = (
        db.query(PrintJob)
        .options(joinedload(PrintJob.printer).joinedload(AgentPrinter.agent))
        .filter(PrintJob.id == job_id)
        .first()
    )
    if job is None:
        raise PrintJobNotFoundError("Print job not found")
    if job.printer is None or job.printer.agent_id != agent.id:
        raise TenantScopeError("Print job outside agent scope")
    if job.printer.agent is not None and job.printer.agent.tenant_id != agent.tenant_id:
        raise TenantScopeError("Print job outside tenant scope")
    return job


def claim_print_job(db: Session, *, job_id: int, agent: PrinterAgent) -> PrintJob:
    job = _load_job_for_agent(db, job_id=job_id, agent=agent)
    _assert_transition(job.status, JOB_STATUS_PROCESSING)

    now = datetime.utcnow()
    result = db.execute(
        update(PrintJob)
        .where(
            PrintJob.id == job_id,
            PrintJob.status == JOB_STATUS_PENDING,
        )
        .values(status=JOB_STATUS_PROCESSING, started_at=now)
    )
    if result.rowcount == 0:
        db.refresh(job)
        raise JobTransitionConflictError(
            f"Job {job_id} is not claimable (current status: {job.status})",
        )
    db.commit()
    db.refresh(job)
    return job


def complete_print_job(db: Session, *, job_id: int, agent: PrinterAgent) -> PrintJob:
    job = _load_job_for_agent(db, job_id=job_id, agent=agent)
    _assert_transition(job.status, JOB_STATUS_PRINTED)

    now = datetime.utcnow()
    result = db.execute(
        update(PrintJob)
        .where(
            PrintJob.id == job_id,
            PrintJob.status.in_([JOB_STATUS_PROCESSING, JOB_STATUS_CANCELLED]),
        )
        .values(status=JOB_STATUS_PRINTED, finished_at=now, error_message=None)
    )
    if result.rowcount == 0:
        db.refresh(job)
        raise JobTransitionConflictError(
            f"Job {job_id} cannot be completed (current status: {job.status})",
        )
    db.commit()
    db.refresh(job)
    return job


def fail_print_job(
    db: Session,
    *,
    job_id: int,
    agent: PrinterAgent,
    error_message: str,
) -> PrintJob:
    job = _load_job_for_agent(db, job_id=job_id, agent=agent)
    _assert_transition(job.status, JOB_STATUS_FAILED)

    now = datetime.utcnow()
    result = db.execute(
        update(PrintJob)
        .where(
            PrintJob.id == job_id,
            PrintJob.status.in_([JOB_STATUS_PROCESSING, JOB_STATUS_CANCELLED]),
        )
        .values(
            status=JOB_STATUS_FAILED,
            finished_at=now,
            error_message=error_message.strip(),
        )
    )
    if result.rowcount == 0:
        db.refresh(job)
        raise JobTransitionConflictError(
            f"Job {job_id} cannot be marked failed (current status: {job.status})",
        )
    db.commit()
    db.refresh(job)
    return job


def serialize_print_job(job: PrintJob) -> dict[str, Any]:
    printer = job.printer if hasattr(job, "printer") else None
    agent = printer.agent if printer is not None and hasattr(printer, "agent") else None
    duration_seconds = None
    if job.started_at and job.finished_at:
        duration_seconds = max(0, int((job.finished_at - job.started_at).total_seconds()))

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
        "duration_seconds": duration_seconds,
    }
