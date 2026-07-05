"""Complaint documents — DTE with ReportLab legacy fallback."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..document_templates.services.erp_document_render_service import render_erp_document_pdf_bytes
from ..document_templates.services.template_hierarchy_resolver import RenderTemplateContext
from ..models.complaint import Complaint
from .complaint_document_pdf import (
    build_correction_pdf_bytes,
    build_decision_pdf_bytes,
    build_rma_pdf_bytes,
)

DOCUMENT_TYPE_DECISION = "DECISION"
DOCUMENT_TYPE_CORRECTION = "CORRECTION"
DOCUMENT_TYPE_RMA = "RMA"


def build_complaint_document_pdf_bytes(
    db: Session,
    *,
    tenant_id: int,
    complaint: Complaint,
    document_type: str,
) -> bytes:
    dt = str(document_type or "").strip().upper()

    def _legacy() -> bytes:
        if dt == DOCUMENT_TYPE_CORRECTION:
            from ..models.order import Order

            order = None
            if getattr(complaint, "order_id", None):
                order = db.query(Order).filter(Order.id == int(complaint.order_id)).first()
            return build_correction_pdf_bytes(complaint, order)
        if dt == DOCUMENT_TYPE_RMA:
            return build_rma_pdf_bytes(complaint)
        return build_decision_pdf_bytes(complaint)

    return render_erp_document_pdf_bytes(
        db,
        tenant_id=int(tenant_id),
        kind_code="complaint_document",
        params={
            "complaint_id": int(complaint.id),
            "document_type": dt,
        },
        legacy_renderer=_legacy,
        ctx=RenderTemplateContext(
            tenant_id=int(tenant_id),
            kind_code="complaint_document",
            scope_type="COMPLAINTS",
            scope_id=int(tenant_id),
        ),
        log_label=f"complaint_id={complaint.id} type={dt}",
    )
