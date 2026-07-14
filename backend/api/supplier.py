"""CRUD for suppliers (dostawcy), tenant-scoped."""

from __future__ import annotations

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..auth.deps import get_optional_current_user
from ..catalog.supplier_taxonomy import list_country_choices, list_currency_choices
from ..database import get_db
from ..models.app_user import AppUser
from ..models.inbound_delivery import InboundDelivery
from ..models.supplier import Supplier
from ..schemas.supplier import SupplierCreateBody, SupplierRead, SupplierUpdateBody
from ..services.suppliers.supplier_list_service import SupplierListQueryError, list_suppliers_for_tenant
from ..services.suppliers.supplier_projection import (
    delivery_counts,
    product_counts,
    strip_optional_text,
    supplier_to_read,
)

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])
logger = logging.getLogger(__name__)


@router.get("/taxonomy")
def get_supplier_taxonomy():
    """Allowed countries (with EU flag) and currencies — aligned with ``catalog.supplier_taxonomy`` validators."""
    return {
        "countries": list_country_choices(),
        "currencies": [{"code": c} for c in list_currency_choices()],
    }


@router.get("/", response_model=List[SupplierRead])
def list_suppliers(
    tenant_id: int = Query(..., ge=1),
    name: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    phone: Optional[str] = Query(None),
    currency: Optional[str] = Query(None),
    requires_moq: Optional[bool] = Query(None),
    offers_free_shipping: Optional[bool] = Query(None),
    min_product_count: Optional[int] = Query(None, ge=0),
    min_delivery_count: Optional[int] = Query(None, ge=0),
    status: str = Query("all", description="all | active | inactive"),
    sort_by: str = Query("name", description="name only"),
    sort_dir: str = Query("asc", description="asc | desc"),
    db: Session = Depends(get_db),
    user: Optional[AppUser] = Depends(get_optional_current_user),
):
    user_id = user.id if user is not None else None
    try:
        return list_suppliers_for_tenant(
            db,
            tenant_id=int(tenant_id),
            name=name,
            country=country,
            city=city,
            email=email,
            phone=phone,
            currency=currency,
            requires_moq=requires_moq,
            offers_free_shipping=offers_free_shipping,
            min_product_count=min_product_count,
            min_delivery_count=min_delivery_count,
            status=status,
            sort_dir=sort_dir,
        )
    except SupplierListQueryError as exc:
        logger.exception(
            "[suppliers] tenant_id=%s user_id=%s error=%s",
            tenant_id,
            user_id,
            exc,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": exc.message,
                "code": exc.code,
            },
        ) from exc
    except Exception as exc:
        logger.exception(
            "[suppliers] tenant_id=%s user_id=%s error=%s",
            tenant_id,
            user_id,
            exc,
        )
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Nie udało się wczytać listy dostawców. Spróbuj ponownie za chwilę.",
                "code": "SUPPLIERS_LIST_FAILED",
            },
        ) from exc


@router.get("/{supplier_id}", response_model=SupplierRead)
def get_supplier(supplier_id: int, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    cnt = (
        db.query(func.count(InboundDelivery.id))
        .filter(InboundDelivery.supplier_id == s.id, InboundDelivery.tenant_id == tenant_id)
        .scalar()
    )
    return supplier_to_read(
        s,
        delivery_count=int(cnt or 0),
        product_count=product_counts(db, tenant_id, [s.id]).get(s.id, 0),
    )


@router.post("/", response_model=SupplierRead, status_code=201)
def create_supplier(body: SupplierCreateBody, db: Session = Depends(get_db)):
    s = Supplier(
        tenant_id=body.tenant_id,
        name=body.name.strip(),
        company_name=strip_optional_text(body.company_name),
        tax_id=strip_optional_text(body.tax_id),
        email=strip_optional_text(body.email),
        phone=strip_optional_text(body.phone),
        website=strip_optional_text(body.website),
        country=strip_optional_text(body.country),
        city=strip_optional_text(body.city),
        postal_code=strip_optional_text(body.postal_code),
        street=strip_optional_text(body.street),
        address=strip_optional_text(body.address),
        active=bool(body.active),
        default_lead_time_days=body.default_lead_time_days,
        default_currency=body.default_currency,
        minimum_order_value=(body.minimum_order_value if body.requires_moq else None),
        minimum_order_qty=(body.minimum_order_qty if body.requires_moq else None),
        free_shipping_threshold=(body.free_shipping_threshold if body.offers_free_shipping else None),
        offers_free_shipping=bool(body.offers_free_shipping),
        requires_moq=bool(body.requires_moq),
        notes=strip_optional_text(body.notes),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return supplier_to_read(s, delivery_count=0, product_count=0)


@router.put("/{supplier_id}", response_model=SupplierRead)
def update_supplier(
    supplier_id: int,
    body: SupplierUpdateBody,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    s = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    s.name = body.name.strip()
    s.company_name = strip_optional_text(body.company_name)
    s.tax_id = strip_optional_text(body.tax_id)
    s.email = strip_optional_text(body.email)
    s.phone = strip_optional_text(body.phone)
    s.website = strip_optional_text(body.website)
    s.country = strip_optional_text(body.country)
    s.city = strip_optional_text(body.city)
    s.postal_code = strip_optional_text(body.postal_code)
    s.street = strip_optional_text(body.street)
    s.address = strip_optional_text(body.address)
    s.active = bool(body.active)
    s.default_lead_time_days = body.default_lead_time_days
    s.default_currency = body.default_currency
    s.offers_free_shipping = bool(body.offers_free_shipping)
    s.requires_moq = bool(body.requires_moq)
    s.minimum_order_value = body.minimum_order_value if body.requires_moq else None
    s.minimum_order_qty = body.minimum_order_qty if body.requires_moq else None
    s.free_shipping_threshold = body.free_shipping_threshold if body.offers_free_shipping else None
    s.notes = strip_optional_text(body.notes)
    db.commit()
    db.refresh(s)
    cnt = (
        db.query(func.count(InboundDelivery.id))
        .filter(InboundDelivery.supplier_id == s.id, InboundDelivery.tenant_id == tenant_id)
        .scalar()
    )
    return supplier_to_read(
        s,
        delivery_count=int(cnt or 0),
        product_count=product_counts(db, tenant_id, [s.id]).get(s.id, 0),
    )


@router.delete("/{supplier_id}")
def delete_supplier(supplier_id: int, tenant_id: int = Query(..., ge=1), db: Session = Depends(get_db)):
    s = db.query(Supplier).filter(Supplier.id == supplier_id, Supplier.tenant_id == tenant_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="Supplier not found")
    cnt = (
        db.query(func.count(InboundDelivery.id))
        .filter(InboundDelivery.supplier_id == s.id, InboundDelivery.tenant_id == tenant_id)
        .scalar()
    )
    n = int(cnt or 0)
    if n > 0:
        s.active = False
        db.commit()
        return {"deactivated": True, "delivery_count": n, "detail": "Supplier has deliveries — marked inactive."}
    db.delete(s)
    db.commit()
    return {"deleted": True, "delivery_count": 0}
