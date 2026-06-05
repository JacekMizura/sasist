"""Location stock projection API — shared by direct sales, WMS, mobile."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.location_stock import LocationStockResponse
from ..services.location_stock_service import build_location_stock, resolve_product_id

router = APIRouter(prefix="/location-stock", tags=["Location stock"])


@router.get("", response_model=LocationStockResponse)
def get_location_stock(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    product_id: int | None = Query(None, ge=1),
    ean: str | None = Query(None, min_length=1, max_length=64),
    sku: str | None = Query(None, min_length=1, max_length=128),
    operational_zone_type: str | None = Query(None, max_length=24),
    available_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    pid = resolve_product_id(
        db,
        tenant_id=tenant_id,
        product_id=product_id,
        ean=ean,
        sku=sku,
    )
    if pid is None:
        raise HTTPException(status_code=404, detail="Product not found for given identifiers.")
    raw = build_location_stock(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=pid,
        operational_zone_type=operational_zone_type,
        available_only=available_only,
    )
    return LocationStockResponse(**raw)
