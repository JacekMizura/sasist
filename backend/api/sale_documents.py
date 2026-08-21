"""Sale documents list + detail (FV/PA) — direct sales and WMS packing."""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from jinja2 import TemplateNotFound
from sqlalchemy.orm import Session

_logger = logging.getLogger(__name__)

from ..database import get_db
from ..schemas.sale_document import SaleDocumentDetailRead
from ..services.document_print_template_catalog import list_print_template_presets
from ..services.sale_document_detail_service import get_sale_document_detail
from ..services.sale_documents import (
    SaleCorrectionError,
    issue_sale_correction_for_return,
    list_corrections_for_source,
)
from ..services.sale_documents_list_service import list_sale_documents
from pydantic import BaseModel, Field

router = APIRouter(prefix="/sale-documents", tags=["Sale documents"])


class IssueSaleCorrectionFromReturnBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    return_id: int = Field(..., ge=1)
    warehouse_id: int | None = Field(None, ge=1)
    source_sale_document_id: str | None = None
    reason: str | None = None


@router.get("/")
def get_sale_documents(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(None, ge=1),
    panel_document_type: str | None = Query(
        None,
        description="PARAGON | INVOICE — filter receipts vs VAT invoices",
    ),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    items = list_sale_documents(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        panel_document_type=panel_document_type,
        limit=limit,
        offset=offset,
    )
    return {"items": items, "total": len(items)}


@router.get("/print-template-presets")
def get_print_template_presets():
    return {"items": list_print_template_presets()}


@router.post("/corrections/from-return")
def post_sale_correction_from_return(body: IssueSaleCorrectionFromReturnBody, db: Session = Depends(get_db)):
    """Issue invoice correction (KOR) from a finalized RMZ return — domain pipeline, not automation."""
    try:
        doc, reused = issue_sale_correction_for_return(
            db,
            tenant_id=int(body.tenant_id),
            return_id=int(body.return_id),
            source_sale_document_id=body.source_sale_document_id,
            reason=body.reason,
            warehouse_id=body.warehouse_id,
        )
        db.commit()
    except SaleCorrectionError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message}) from exc
    except Exception:
        db.rollback()
        _logger.exception("post_sale_correction_from_return failed")
        raise HTTPException(status_code=500, detail="Nie udało się wystawić korekty.") from None

    source = None
    if doc.source_sale_document_id:
        from ..models.sale_document import SaleDocument

        source = (
            db.query(SaleDocument)
            .filter(
                SaleDocument.id == str(doc.source_sale_document_id),
                SaleDocument.tenant_id == int(body.tenant_id),
            )
            .first()
        )
    return {
        "correction_document_id": str(doc.id),
        "correction_number": str(doc.document_number or ""),
        "source_document_id": str(doc.source_sale_document_id or ""),
        "source_document_number": str(source.document_number or "") if source else None,
        "reused_existing": bool(reused),
        "total_net": doc.total_net,
        "total_vat": doc.total_vat,
        "total_gross": doc.total_gross,
    }


@router.get("/{document_id}/corrections")
def get_sale_document_corrections(
    document_id: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    rows = list_corrections_for_source(db, tenant_id=int(tenant_id), source_sale_document_id=document_id)
    return {
        "items": [
            {
                "id": str(r.id),
                "document_number": str(r.document_number or ""),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "total_gross": r.total_gross,
                "business_source_type": r.business_source_type,
                "business_source_id": r.business_source_id,
                "correction_scope_hash": r.correction_scope_hash,
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.get("/{document_id}", response_model=SaleDocumentDetailRead)
def get_sale_document(
    document_id: str,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    detail = get_sale_document_detail(db, tenant_id=int(tenant_id), document_id=document_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Dokument sprzedaży nie istnieje.")
    return detail


@router.get("/{document_id}/pdf")
def get_sale_document_pdf(
    document_id: str,
    tenant_id: int = Query(..., ge=1),
    template_version_id: int | None = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    from ..services.document_print_service import PdfRendererUnavailable
    from ..services.sale_document_pdf_service import build_sale_document_pdf_bytes

    try:
        pdf = build_sale_document_pdf_bytes(
            db,
            tenant_id=int(tenant_id),
            document_id=document_id,
            template_version_id=template_version_id,
        )
    except ValueError as exc:
        _logger.warning(
            "[sale_document_pdf] not found document_id=%s tenant_id=%s: %s",
            document_id,
            tenant_id,
            exc,
        )
        raise HTTPException(status_code=404, detail="Dokument sprzedaży nie istnieje.") from exc
    except PdfRendererUnavailable as exc:
        _logger.error(
            "[sale_document_pdf] renderer unavailable document_id=%s tenant_id=%s: %s",
            document_id,
            tenant_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=503, detail="PDF renderer unavailable") from exc
    except TemplateNotFound as exc:
        _logger.error(
            "[sale_document_pdf] template missing document_id=%s tenant_id=%s: %s",
            document_id,
            tenant_id,
            exc,
            exc_info=True,
        )
        raise HTTPException(status_code=503, detail="PDF renderer unavailable") from exc
    except Exception as exc:
        _logger.exception(
            "[sale_document_pdf] failed document_id=%s tenant_id=%s",
            document_id,
            tenant_id,
        )
        raise HTTPException(status_code=500, detail="Nie udało się wygenerować PDF dokumentu.") from exc
    if not pdf or not pdf.startswith(b"%PDF"):
        _logger.error(
            "[sale_document_pdf] invalid pdf bytes document_id=%s tenant_id=%s len=%s",
            document_id,
            tenant_id,
            len(pdf or b""),
        )
        raise HTTPException(status_code=503, detail="PDF renderer unavailable")
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="dokument-{document_id}.pdf"'},
    )
