"""WMS product operational preview (inventory + logistics, no pricing)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.wms_product_incomplete import WmsProductIncompleteListOut, WmsProductIncompleteScanResolve
from ..schemas.wms_product_search import WmsCreateMinimalProductBody, WmsProductSearchHit
from ..schemas.wms_product_view import WmsProductViewResponse
from ..schemas.stock_document import StockDocumentRead
from ..services.wms_product_incomplete_service import list_incomplete_receiving_products
from ..services.wms_product_search_service import search_wms_products
from ..services.wms_product_view_service import build_wms_product_view
from ..services.wms_receiving_service import create_minimal_wms_product_for_operations

router = APIRouter(prefix="/wms/products", tags=["WMS products"])


@router.get("/incomplete-receiving-data", response_model=WmsProductIncompleteListOut)
def get_wms_incomplete_receiving_products(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    limit: int = Query(200, ge=1, le=500),
    db: Session = Depends(get_db),
):
    try:
        return list_incomplete_receiving_products(
            db, tenant_id=tenant_id, warehouse_id=warehouse_id, limit=limit
        )
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception(
            "incomplete-receiving-data failed tenant_id=%s warehouse_id=%s",
            tenant_id,
            warehouse_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Nie udało się wczytać listy produktów z brakującymi danymi.",
        ) from exc


@router.get("/incomplete-receiving-data/resolve-scan", response_model=WmsProductIncompleteScanResolve)
def get_wms_incomplete_receiving_resolve_scan(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    code: str = Query(..., min_length=1, max_length=128),
    db: Session = Depends(get_db),
):
    hit = resolve_incomplete_product_scan(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        code=code,
    )
    if not hit:
        raise HTTPException(status_code=404, detail="Nie znaleziono produktu na liście uzupełniania danych.")
    return hit


@router.get("/search", response_model=list[WmsProductSearchHit])
def get_wms_products_search(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    q: str = Query(..., min_length=2, max_length=128),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
):
    try:
        return search_wms_products(db, tenant_id=tenant_id, warehouse_id=warehouse_id, query=q, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.post("/minimal", status_code=201)
def post_wms_minimal_product(
    body: WmsCreateMinimalProductBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        product, doc = create_minimal_wms_product_for_operations(
            db,
            tenant_id,
            name=body.name,
            ean=body.ean,
            sku=body.sku,
            unit=body.unit or "szt.",
            create_in_assortment=bool(body.create_in_assortment),
            pz_id=body.pz_id,
        )
        db.commit()
        return {
            "product_id": int(product.id),
            "product_name": product.name,
            "product_ean": product.ean,
            "document": doc,
        }
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/{product_id}/view", response_model=WmsProductViewResponse)
def get_wms_product_view(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Podgląd produktu dla magazynu: stany wg inventory, lokalizacje, logistyka, karton (bez cen i zamówień)."""
    out = build_wms_product_view(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
    )
    if not out:
        raise HTTPException(status_code=404, detail="Produkt nie istnieje lub inny tenant.")
    return out
