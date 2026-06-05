"""Document generation job status API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.document_generation_job import DocumentGenerationJob
from ..schemas.document_generation_job import DocumentGenerationJobRead

router = APIRouter(prefix="/document-jobs", tags=["Document jobs"])


@router.get("/{job_id}", response_model=DocumentGenerationJobRead)
def get_document_job(
    job_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    job = (
        db.query(DocumentGenerationJob)
        .filter(
            DocumentGenerationJob.id == int(job_id),
            DocumentGenerationJob.tenant_id == int(tenant_id),
        )
        .first()
    )
    if job is None:
        raise HTTPException(status_code=404, detail="Document job not found.")
    return DocumentGenerationJobRead(
        id=int(job.id),
        tenant_id=int(job.tenant_id),
        warehouse_id=int(job.warehouse_id),
        order_id=int(job.order_id) if job.order_id else None,
        session_id=int(job.session_id) if job.session_id else None,
        document_type=str(job.document_type or ""),
        document_subtype=str(job.document_subtype or ""),
        status=str(job.status or ""),
        sale_document_id=job.sale_document_id,
        fiscal_status=job.fiscal_status,
        fiscal_ref=job.fiscal_ref,
        error_message=job.error_message,
        created_at=job.created_at,
        completed_at=job.completed_at,
    )
