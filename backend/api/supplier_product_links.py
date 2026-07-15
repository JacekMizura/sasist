"""CRUD for supplier_products (many-to-many catalog offers per supplier)."""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.product import Product
from ..models.supplier import Supplier
from ..models.supplier_product import SupplierProduct
from ..schemas.supplier_product_link import (
    SupplierProductLinkCreateBody,
    SupplierProductLinkPatchBody,
    SupplierProductLinkRead,
)
from ..schemas.supplier_products import SupplierCatalogPriceTier
from ..services.delivery_line_pricing import parse_supplier_product_tier_steps
from ..services.supplier_product_links.create_service import create_supplier_product_link_for_tenant
from ..services.supplier_product_links.errors import SupplierProductLinkError

router = APIRouter(prefix="/supplier-product-links", tags=["Supplier catalog"])
logger = logging.getLogger(__name__)


def _tiers_json_from_body(tiers: Optional[List[SupplierCatalogPriceTier]]) -> Optional[str]:
    if tiers is None:
        return None
    if len(tiers) == 0:
        return None
    payload = [{"qty_from": float(t.qty_from), "unit_net": float(t.unit_net)} for t in tiers]
    return json.dumps(payload, ensure_ascii=False)


def _serialize(db: Session, row: SupplierProduct) -> SupplierProductLinkRead:
    sup = db.query(Supplier).filter(Supplier.id == row.supplier_id).first()
    pr = db.query(Product).filter(Product.id == row.product_id).first()
    ds = getattr(pr, "default_supplier_id", None) if pr else None
    pp = row.purchase_price
    moq = row.min_order_qty
    steps = parse_supplier_product_tier_steps(row)
    tier_models = [SupplierCatalogPriceTier(qty_from=float(a), unit_net=float(b)) for a, b in steps]
    return SupplierProductLinkRead(
        id=row.id,
        supplier_id=row.supplier_id,
        product_id=row.product_id,
        supplier_name=(sup.name or "").strip() if sup else "",
        product_name=(pr.name or "").strip() if pr else "",
        product_symbol=(pr.symbol or "").strip() if pr and pr.symbol else None,
        purchase_price=float(pp) if pp is not None else None,
        purchase_price_tiers=tier_models,
        lead_time_days=int(row.lead_time_days) if row.lead_time_days is not None else None,
        min_order_qty=float(moq) if moq is not None else None,
        is_default_supplier=bool(pr and ds is not None and int(ds) == int(row.supplier_id)),
    )


@router.get("/", response_model=List[SupplierProductLinkRead])
def list_supplier_product_links(
    tenant_id: int = Query(..., ge=1),
    supplier_id: Optional[int] = Query(None, ge=1),
    product_id: Optional[int] = Query(None, ge=1),
    db: Session = Depends(get_db),
):
    if supplier_id is None and product_id is None:
        raise HTTPException(status_code=400, detail="Provide supplier_id and/or product_id")
    q = db.query(SupplierProduct)
    if supplier_id is not None:
        sup = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
        if not sup:
            raise HTTPException(status_code=400, detail="Invalid supplier_id for tenant")
        q = q.filter(SupplierProduct.supplier_id == supplier_id)
    if product_id is not None:
        pr = db.query(Product).filter(Product.id == product_id, Product.tenant_id == tenant_id).first()
        if not pr:
            raise HTTPException(status_code=400, detail="Invalid product_id for tenant")
        q = q.filter(SupplierProduct.product_id == product_id)
    q = (
        q.join(Supplier, Supplier.id == SupplierProduct.supplier_id)
        .join(Product, Product.id == SupplierProduct.product_id)
        .filter(Supplier.tenant_id == tenant_id, Product.tenant_id == tenant_id)
    )
    rows = q.order_by(SupplierProduct.id.asc()).all()
    return [_serialize(db, r) for r in rows]


@router.post("/", response_model=SupplierProductLinkRead, status_code=201)
def create_supplier_product_link(body: SupplierProductLinkCreateBody, db: Session = Depends(get_db)):
    payload = body.model_dump()
    tenant_id = body.tenant_id
    try:
        row = create_supplier_product_link_for_tenant(db, body)
        return _serialize(db, row)
    except SupplierProductLinkError as exc:
        logger.exception(
            "[supplier-product-links] tenant_id=%s payload=%s error=%s",
            tenant_id,
            payload,
            exc,
        )
        raise HTTPException(status_code=exc.http_status, detail=exc.as_detail()) from exc
    except Exception as exc:
        mapped = SupplierProductLinkError(
            "Nie udało się utworzyć powiązania produkt–dostawca. Spróbuj ponownie za chwilę.",
            code="SUPPLIER_PRODUCT_LINK_CREATE_FAILED",
            details=str(exc),
            http_status=503,
        )
        logger.exception(
            "[supplier-product-links] tenant_id=%s payload=%s error=%s",
            tenant_id,
            payload,
            exc,
        )
        raise HTTPException(status_code=mapped.http_status, detail=mapped.as_detail()) from exc


@router.patch("/{link_id}", response_model=SupplierProductLinkRead)
def patch_supplier_product_link(
    link_id: int,
    body: SupplierProductLinkPatchBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = db.query(SupplierProduct).filter(SupplierProduct.id == link_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Link not found")
    sup = db.query(Supplier).filter(Supplier.id == row.supplier_id, Supplier.tenant_id == tenant_id).first()
    pr = db.query(Product).filter(Product.id == row.product_id, Product.tenant_id == tenant_id).first()
    if not sup or not pr:
        raise HTTPException(status_code=404, detail="Link not found")
    raw = body.model_dump(exclude_unset=True)
    if "purchase_price" in raw:
        row.purchase_price = raw["purchase_price"]
    if "lead_time_days" in raw:
        row.lead_time_days = raw["lead_time_days"]
    if "min_order_qty" in raw:
        row.min_order_qty = raw["min_order_qty"]
    if "purchase_price_tiers" in raw:
        row.purchase_price_tiers_json = _tiers_json_from_body(body.purchase_price_tiers)
    db.commit()
    db.refresh(row)
    return _serialize(db, row)


@router.delete("/{link_id}")
def delete_supplier_product_link(
    link_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = db.query(SupplierProduct).filter(SupplierProduct.id == link_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Link not found")
    sup = db.query(Supplier).filter(Supplier.id == row.supplier_id, Supplier.tenant_id == tenant_id).first()
    pr = db.query(Product).filter(Product.id == row.product_id, Product.tenant_id == tenant_id).first()
    if not sup or not pr:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(row)
    if pr.default_supplier_id is not None and int(pr.default_supplier_id) == int(row.supplier_id):
        pr.default_supplier_id = None
    db.commit()
    return {"deleted": True}
