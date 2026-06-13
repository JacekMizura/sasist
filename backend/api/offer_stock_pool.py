"""Offer stock pools — settings CRUD."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas.offer_stock_pool import (
    OfferStockPoolCreateBody,
    OfferStockPoolPatchBody,
    OfferStockPoolRead,
    OfferStockPoolsListOut,
)
from ..services.offer_stock_pool_service import (
    OfferStockPoolError,
    create_pool,
    get_pool_or_404,
    list_pools,
    pool_to_dict,
    update_pool,
)

router = APIRouter(tags=["Offer stock pools"])


@router.get("/offer-stock-pools", response_model=OfferStockPoolsListOut)
def get_offer_stock_pools(
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    items = [OfferStockPoolRead(**row) for row in list_pools(db, tenant_id=int(tenant_id))]
    return OfferStockPoolsListOut(items=items)


@router.post("/offer-stock-pools", response_model=OfferStockPoolRead)
def post_offer_stock_pool(
    body: OfferStockPoolCreateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        pool = create_pool(
            db,
            tenant_id=int(tenant_id),
            name=body.name,
            warehouse_ids=body.warehouse_ids,
            is_default=body.is_default,
        )
        db.commit()
        db.refresh(pool)
    except OfferStockPoolError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return OfferStockPoolRead(**pool_to_dict(db, pool=pool, tenant_id=int(tenant_id)))


@router.patch("/offer-stock-pools/{pool_id}", response_model=OfferStockPoolRead)
def patch_offer_stock_pool(
    pool_id: int,
    body: OfferStockPoolPatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    pool = get_pool_or_404(db, tenant_id=int(tenant_id), pool_id=int(pool_id))
    try:
        update_pool(
            db,
            pool=pool,
            name=body.name,
            warehouse_ids=body.warehouse_ids,
            is_default=body.is_default,
        )
        db.commit()
        db.refresh(pool)
    except OfferStockPoolError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return OfferStockPoolRead(**pool_to_dict(db, pool=pool, tenant_id=int(tenant_id)))
