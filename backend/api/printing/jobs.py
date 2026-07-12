"""Print job queue endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.printing.job import (
    PrintJobCompleteRequest,
    PrintJobCreateRequest,
    PrintJobDetailRead,
    PrintJobFailRequest,
    PrintJobPendingResponse,
    PrintJobRead,
)
from ...schemas.printing.queue import QueuePrintRequest
from ...services.printing.agent_auth_service import get_current_agent
from ...services.printing.errors import PrintingError
from ...services.printing.file_service import load_job_pdf
from ...services.printing.job_admin_service import (
    cancel_print_job,
    get_print_job,
    list_jobs_by_document,
    list_print_jobs,
    retry_print_job,
    soft_delete_print_job,
)
from ...services.printing.job_service import (
    claim_print_job,
    complete_print_job,
    create_print_job,
    fail_print_job,
    list_pending_jobs_for_agent,
    serialize_print_job,
)
from ...services.printing.queue_service import queue_print_job
from ._helpers import raise_printing_error

router = APIRouter()


@router.post("/jobs", response_model=PrintJobRead)
def create_job(
    payload: PrintJobCreateRequest,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job = create_print_job(db, tenant_id=tenant_id, payload=payload)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.get("/jobs", response_model=list[PrintJobRead])
def list_jobs(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, min_length=1),
    limit: int = Query(default=200, ge=1, le=500),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_print_jobs(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        status=status,
        search=q,
        limit=limit,
    )


@router.get("/jobs/by-document", response_model=list[PrintJobRead])
def jobs_by_document(
    document_type: str = Query(..., min_length=1),
    document_id: int = Query(..., ge=1),
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_jobs_by_document(
        db,
        tenant_id=tenant_id,
        document_type=document_type,
        document_id=document_id,
        warehouse_id=warehouse_id,
    )


@router.get("/jobs/pending", response_model=PrintJobPendingResponse)
def get_pending_jobs(
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    jobs = list_pending_jobs_for_agent(db, agent)
    return PrintJobPendingResponse(jobs=jobs)


@router.post("/jobs/queue", response_model=PrintJobRead)
def queue_job(
    payload: QueuePrintRequest,
    request: Request,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_base = str(request.base_url).rstrip("/")
    try:
        job = queue_print_job(db, tenant_id=tenant_id, payload=payload, api_base_url=api_base)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.get("/jobs/{job_id}", response_model=PrintJobDetailRead)
def get_job(
    job_id: int,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_print_job(db, tenant_id=tenant_id, job_id=job_id)
    except PrintingError as exc:
        raise_printing_error(exc)


@router.post("/jobs/{job_id}/retry", response_model=PrintJobRead)
def retry_job(
    job_id: int,
    request: Request,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_base = str(request.base_url).rstrip("/")
    try:
        job = retry_print_job(db, tenant_id=tenant_id, job_id=job_id, api_base_url=api_base)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.post("/jobs/{job_id}/cancel", response_model=PrintJobRead)
def cancel_job(
    job_id: int,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job = cancel_print_job(db, tenant_id=tenant_id, job_id=job_id)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.delete("/jobs/{job_id}", response_model=PrintJobRead)
def delete_job(
    job_id: int,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        job = soft_delete_print_job(db, tenant_id=tenant_id, job_id=job_id)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.post("/jobs/{job_id}/processing", response_model=PrintJobRead)
def mark_job_processing(
    job_id: int,
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    try:
        job = claim_print_job(db, job_id=job_id, agent=agent)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.post("/jobs/{job_id}/complete", response_model=PrintJobRead)
def mark_job_complete(
    job_id: int,
    _: PrintJobCompleteRequest,
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    try:
        job = complete_print_job(db, job_id=job_id, agent=agent)
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.post("/jobs/{job_id}/failed", response_model=PrintJobRead)
def mark_job_failed(
    job_id: int,
    payload: PrintJobFailRequest,
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    try:
        job = fail_print_job(
            db,
            job_id=job_id,
            agent=agent,
            error_message=payload.error_message,
        )
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.get("/jobs/{job_id}/file")
def download_job_file(
    job_id: int,
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    from ...models.printing.agent_printer import AgentPrinter
    from ...models.printing.print_job import PrintJob

    job = (
        db.query(PrintJob)
        .join(AgentPrinter, PrintJob.printer_id == AgentPrinter.id)
        .filter(PrintJob.id == job_id, AgentPrinter.agent_id == agent.id)
        .first()
    )
    if job is None:
        raise_printing_error(PrintingError("Print job not found", status_code=404))

    pdf_bytes = load_job_pdf(job_id)
    if pdf_bytes is None:
        raise_printing_error(PrintingError("Print file not found", status_code=404))

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="print-job-{job_id}.pdf"'},
    )
