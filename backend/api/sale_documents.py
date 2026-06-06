"""Sale documents list + detail (FV/PA) — direct sales and WMS packing."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.sale_document import SaleDocumentDetailRead
from ..services.sale_document_detail_service import get_sale_document_detail
from ..services.sale_documents_list_service import list_sale_documents

router = APIRouter(prefix="/sale-documents", tags=["Sale documents"])


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
