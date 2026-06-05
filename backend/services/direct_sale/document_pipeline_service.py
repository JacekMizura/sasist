"""Document generation pipeline — async job queue (no inline generation in complete)."""



from __future__ import annotations



import logging

from dataclasses import dataclass



from sqlalchemy.orm import Session



from ...models.document_generation_job import DocumentGenerationJob

from ..documents.generation_queue_service import enqueue_document_job
from ...workers.document_generation_worker import get_job_document_number, process_document_job
from .errors import DirectSaleError



logger = logging.getLogger(__name__)





@dataclass

class DirectSaleDocumentRequest:

    tenant_id: int

    warehouse_id: int

    order_id: int

    session_id: int

    document_subtype: str = "RECEIPT"

    performed_by_user_id: int | None = None

    device_id: int | None = None

    fiscal_profile: str | None = None

    operational_zone: str | None = None





@dataclass

class DirectSaleDocumentResult:

    job_id: int

    sale_document_id: str | None

    document_number: str | None

    document_subtype: str

    status: str





def enqueue_direct_sale_documents(db: Session, req: DirectSaleDocumentRequest) -> DirectSaleDocumentResult:

    """Enqueue async job — worker generates document (never inline in complete)."""

    sub = (req.document_subtype or "RECEIPT").strip().upper()

    enq = enqueue_document_job(

        db,

        tenant_id=int(req.tenant_id),

        warehouse_id=int(req.warehouse_id),

        order_id=int(req.order_id),

        session_id=int(req.session_id),

        document_type="SALE",

        document_subtype=sub,

        fiscal_profile=req.fiscal_profile,

        operational_zone=req.operational_zone,

        performed_by_user_id=req.performed_by_user_id,

        device_id=req.device_id,

    )

    return DirectSaleDocumentResult(

        job_id=enq.job_id,

        sale_document_id=None,

        document_number=None,

        document_subtype=sub,

        status=enq.status,

    )





def process_direct_sale_document_job(db: Session, job_id: int) -> DirectSaleDocumentResult:

    job = db.query(DocumentGenerationJob).filter(DocumentGenerationJob.id == int(job_id)).first()

    if job is None:

        raise DirectSaleError("Zadanie dokumentu nie istnieje.", code="job_not_found", http_status=404)

    process_document_job(db, job)

    return DirectSaleDocumentResult(

        job_id=int(job.id),

        sale_document_id=job.sale_document_id,

        document_number=get_job_document_number(job),

        document_subtype=str(job.document_subtype or ""),

        status=str(job.status or ""),

    )


