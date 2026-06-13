"""Product sales offers — minimal internal layer (Etap 3A)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.product import Product
from ..models.product_sales_offer import ProductSalesOffer
from ..schemas.product_sales_offer import (
    ProductSalesOfferPatchBody,
    ProductSalesOfferRead,
    ProductSalesOfferSearchHit,
    ProductSalesOffersListOut,
)
from ..services.offer_stock_availability_service import offer_pool_available_qty
from ..services.product_sales_offers import (
    ProductSalesOfferError,
    create_outlet_offer_preset,
    list_active_offers_for_product,
    offer_available_qty,
    offer_to_read_dict,
    resolve_effective_offer_price,
    soft_delete_offer,
    update_offer,
)
from ..services.product_sales_offers.crud_service import ensure_default_offer_for_product
from ..services.product_sales_offers.price_service import load_product_for_offer

router = APIRouter(tags=["Product sales offers"])


def _read_offer(
    db: Session,
    *,
    offer: ProductSalesOffer,
    warehouse_id: int | None,
) -> ProductSalesOfferRead:
    product = load_product_for_offer(db, offer)
    avail = offer_pool_available_qty(
        db,
        offer=offer,
        tenant_id=int(offer.tenant_id),
    )
    d = offer_to_read_dict(db, offer=offer, product=product, available_qty=avail)
    return ProductSalesOfferRead(**d)


@router.get("/products/{product_id}/sales-offers", response_model=ProductSalesOffersListOut)
def list_product_sales_offers(
    product_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_default_offer_for_product(db, product=product)
    db.flush()
    rows = list_active_offers_for_product(db, tenant_id=int(tenant_id), product_id=int(product_id))
    out = [
        _read_offer(db, offer=o, warehouse_id=warehouse_id)
        for o in rows
    ]
    return ProductSalesOffersListOut(product_id=int(product_id), offers=out)


@router.post("/products/{product_id}/sales-offers/outlet", response_model=ProductSalesOfferRead)
def create_outlet_sales_offer(
    product_id: int,
    tenant_id: int = Query(...),
    warehouse_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_default_offer_for_product(db, product=product)
    try:
        offer = create_outlet_offer_preset(db, product=product)
        db.commit()
        db.refresh(offer)
    except ProductSalesOfferError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.detail) from exc
    return _read_offer(db, offer=offer, warehouse_id=warehouse_id)


@router.patch("/sales-offers/{offer_id}", response_model=ProductSalesOfferRead)
def patch_sales_offer(
    offer_id: int,
    body: ProductSalesOfferPatchBody,
    tenant_id: int = Query(...),
    warehouse_id: int | None = Query(None),
    db: Session = Depends(get_db),
):
    offer = (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.id == int(offer_id),
            ProductSalesOffer.tenant_id == int(tenant_id),
            ProductSalesOffer.deleted_at.is_(None),
        )
        .first()
    )
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    try:
        update_offer(
            db,
            offer=offer,
            name=body.name,
            sale_price_net=body.sale_price_net if "sale_price_net" in body.model_fields_set else ...,
            active=body.active,
            stock_pool_id=body.stock_pool_id if "stock_pool_id" in body.model_fields_set else ...,
        )
        db.commit()
        db.refresh(offer)
    except ProductSalesOfferError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.detail) from exc
    return _read_offer(db, offer=offer, warehouse_id=warehouse_id)


@router.delete("/sales-offers/{offer_id}", status_code=204)
def delete_sales_offer(
    offer_id: int,
    tenant_id: int = Query(...),
    db: Session = Depends(get_db),
):
    offer = (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.id == int(offer_id),
            ProductSalesOffer.tenant_id == int(tenant_id),
            ProductSalesOffer.deleted_at.is_(None),
        )
        .first()
    )
    if offer is None:
        raise HTTPException(status_code=404, detail="Offer not found")
    try:
        soft_delete_offer(db, offer)
        db.commit()
    except ProductSalesOfferError as exc:
        db.rollback()
        raise HTTPException(status_code=exc.http_status, detail=exc.detail) from exc
    return None


@router.get("/sales-offers/search", response_model=list[ProductSalesOfferSearchHit])
def search_sales_offers(
    tenant_id: int = Query(...),
    warehouse_id: int = Query(...),
    q: str = Query(""),
    limit: int = Query(12, ge=1, le=24),
    db: Session = Depends(get_db),
):
    query = (q or "").strip()
    if len(query) < 1:
        return []
    pattern = f"%{query}%"
    products = (
        db.query(Product)
        .filter(
            Product.tenant_id == int(tenant_id),
            Product.deleted_at.is_(None),
            or_(
                Product.name.ilike(pattern),
                Product.ean.ilike(pattern),
                Product.sku.ilike(pattern),
                Product.symbol.ilike(pattern),
            ),
        )
        .limit(limit * 2)
        .all()
    )
    hits: list[ProductSalesOfferSearchHit] = []
    for p in products:
        offers = list_active_offers_for_product(db, tenant_id=int(tenant_id), product_id=int(p.id))
        if not offers:
            ensure_default_offer_for_product(db, product=p)
            db.flush()
            offers = list_active_offers_for_product(db, tenant_id=int(tenant_id), product_id=int(p.id))
        for o in offers:
            avail = offer_available_qty(
                db,
                offer=o,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
            )
            hits.append(
                ProductSalesOfferSearchHit(
                    offer_id=int(o.id),
                    product_id=int(p.id),
                    name=str(o.name),
                    stock_disposition=str(o.stock_disposition),
                    effective_sale_price_net=resolve_effective_offer_price(db, o),
                    available_qty=round(avail, 4),
                    product_name=str(p.name or ""),
                    sku=str(p.sku or p.symbol or "") or None,
                    ean=str(p.ean or "") or None,
                    image_url=str(p.image_url or "") or None,
                )
            )
            if len(hits) >= limit:
                return hits
    return hits
