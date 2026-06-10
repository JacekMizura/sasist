"""Customers (klienci) CRUD + addresses."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import exists, func, or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models.customer import Customer, CustomerAddress, CustomerProductDiscount
from ..models.order import Order
from ..models.product import Product
from ..models.shipping_method import ShippingMethod
from ..schemas.customer import (
    CustomerAddressCreate,
    CustomerAddressOut,
    CustomerBulkDeleteBody,
    CustomerCreate,
    CustomerDetailOut,
    CustomerListOut,
    CustomerProductDiscountOut,
    CustomerProductDiscountWrite,
    CustomerUpdate,
)
from ..schemas.entity_delete import EntityBulkDeleteResult, entity_bulk_delete_result_from_service_dict
from ..services.delete_service import delete_customer_transaction, delete_customers_bulk_transaction

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["Customers"])

from .customers_gus import router as gus_router
from .customer_purchase_history import router as purchase_history_router
from .customer_order_link import router as order_link_router
from .customer_crm import router as crm_router

router.include_router(order_link_router)
router.include_router(gus_router)
router.include_router(purchase_history_router)
router.include_router(crm_router)


def _display_name(c: Customer) -> str:
    comp = (c.company_name or "").strip()
    if comp:
        return comp
    fn = (c.first_name or "").strip()
    ln = (c.last_name or "").strip()
    full = f"{fn} {ln}".strip()
    return full or f"#{c.id}"


def _assert_shipping_method_for_tenant(db: Session, *, tenant_id: int, method_id: Optional[str]) -> None:
    if not method_id or not str(method_id).strip():
        return
    sid = str(method_id).strip()
    sm = (
        db.query(ShippingMethod)
        .filter(ShippingMethod.id == sid, ShippingMethod.tenant_id == int(tenant_id))
        .first()
    )
    if sm is None:
        raise HTTPException(status_code=400, detail="preferred_shipping_method_id not found for tenant")


def _customer_to_detail_out(db: Session, row: Customer) -> CustomerDetailOut:
    addr_rows = sorted(row.addresses or [], key=lambda a: a.id or 0)
    addresses = [
        CustomerAddressOut(
            id=int(a.id),
            customer_id=int(a.customer_id),
            first_name=a.first_name or "",
            last_name=a.last_name or "",
            company_name=a.company_name,
            street=a.street or "",
            house_number=a.house_number or "",
            apartment_number=a.apartment_number,
            postal_code=a.postal_code or "",
            city=a.city or "",
            country_code=a.country_code or "PL",
            is_default=bool(a.is_default),
        )
        for a in addr_rows
    ]
    disc_out: List[CustomerProductDiscountOut] = []
    for d in row.product_discounts or []:
        pname = None
        psku = None
        if d.product_id:
            p = db.query(Product).filter(Product.id == int(d.product_id)).first()
            if p:
                pname = (p.name or "").strip() or None
                psku = (p.sku or "").strip() or None
        disc_out.append(
            CustomerProductDiscountOut(
                id=int(d.id),
                customer_id=int(d.customer_id),
                product_id=int(d.product_id),
                discount_percent=float(d.discount_percent or 0),
                product_name=pname,
                product_sku=psku,
            )
        )
    dt = str(row.default_document_type or "RECEIPT").strip().upper()
    if dt not in ("RECEIPT", "INVOICE"):
        dt = "RECEIPT"
    return CustomerDetailOut(
        id=int(row.id),
        tenant_id=int(row.tenant_id),
        first_name=row.first_name or "",
        last_name=row.last_name or "",
        phone=row.phone,
        email=row.email,
        company_name=row.company_name,
        nip=row.nip,
        country_code=(row.country_code or "PL").strip().upper()[:8] or "PL",
        default_document_type=dt,  # type: ignore[arg-type]
        preferred_shipping_method_id=str(row.preferred_shipping_method_id).strip() if row.preferred_shipping_method_id else None,
        preferred_payment_method=(row.preferred_payment_method or "").strip() or None,
        global_discount_percent=float(row.global_discount_percent or 0),
        created_at=getattr(row, "created_at", None),
        updated_at=getattr(row, "updated_at", None),
        addresses=addresses,
        product_discounts=disc_out,
    )


def _replace_addresses(db: Session, customer_id: int, addresses: List[CustomerAddressCreate]) -> None:
    db.query(CustomerAddress).filter(CustomerAddress.customer_id == int(customer_id)).delete(synchronize_session=False)
    has_default = any(bool(a.is_default) for a in addresses)
    for i, a in enumerate(addresses):
        is_def = bool(a.is_default) if has_default else i == 0 and len(addresses) > 0
        db.add(
            CustomerAddress(
                customer_id=int(customer_id),
                first_name=(a.first_name or "").strip(),
                last_name=(a.last_name or "").strip(),
                company_name=(a.company_name or "").strip() or None,
                street=(a.street or "").strip(),
                house_number=(a.house_number or "").strip(),
                apartment_number=(a.apartment_number or "").strip() or None,
                postal_code=(a.postal_code or "").strip(),
                city=(a.city or "").strip(),
                country_code=(a.country_code or "PL").strip().upper()[:8] or "PL",
                is_default=is_def,
            )
        )


def _normalize_default_addresses(db: Session, customer_id: int) -> None:
    rows = (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == int(customer_id))
        .order_by(CustomerAddress.id.asc())
        .all()
    )
    if not rows:
        return
    if not any(bool(r.is_default) for r in rows):
        rows[0].is_default = True
        db.add(rows[0])
        return
    seen_def = False
    for r in rows:
        if r.is_default:
            if seen_def:
                r.is_default = False
                db.add(r)
            else:
                seen_def = True


def _replace_product_discounts(db: Session, customer: Customer, items: List[CustomerProductDiscountWrite]) -> None:
    cid = int(customer.id)
    tid = int(customer.tenant_id)
    db.query(CustomerProductDiscount).filter(CustomerProductDiscount.customer_id == cid).delete(synchronize_session=False)
    seen: set[int] = set()
    for it in items:
        pid = int(it.product_id)
        if pid in seen:
            continue
        seen.add(pid)
        p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tid).first()
        if p is None:
            raise HTTPException(status_code=400, detail=f"Product {pid} not found for tenant")
        db.add(
            CustomerProductDiscount(
                customer_id=cid,
                product_id=pid,
                discount_percent=float(it.discount_percent),
            )
        )


def _get_customer_or_404(db: Session, customer_id: int, tenant_id: int) -> Customer:
    row = (
        db.query(Customer)
        .options(joinedload(Customer.addresses), joinedload(Customer.product_discounts))
        .filter(
            Customer.id == int(customer_id),
            Customer.tenant_id == int(tenant_id),
            Customer.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    return row


def _parse_yyyy_mm_dd_customer(raw: Optional[str]) -> Optional[datetime]:
    if not raw or not str(raw).strip():
        return None
    s = str(raw).strip()[:10]
    try:
        return datetime.strptime(s, "%Y-%m-%d")
    except ValueError:
        return None


@router.get("", response_model=List[CustomerListOut])
@router.get("/", response_model=List[CustomerListOut], include_in_schema=False)
def list_customers(
    tenant_id: int = Query(..., ge=1),
    search: Optional[str] = Query(None, description="Name, email, phone, company, NIP"),
    country_code: Optional[str] = Query(None, description="ISO 3166-1 alpha-2 (np. PL)"),
    has_orders: Optional[bool] = Query(None, description="Czy klient ma co najmniej jedno nieusunięte zamówienie"),
    has_email: Optional[bool] = Query(None),
    has_phone: Optional[bool] = Query(None),
    created_from: Optional[str] = Query(None, description="YYYY-MM-DD"),
    created_to: Optional[str] = Query(None, description="YYYY-MM-DD (włącznie)"),
    db: Session = Depends(get_db),
):
    q = db.query(Customer).filter(Customer.tenant_id == int(tenant_id), Customer.deleted_at.is_(None))
    if search and str(search).strip():
        s = f"%{str(search).strip()}%"
        q = q.filter(
            or_(
                Customer.first_name.ilike(s),
                Customer.last_name.ilike(s),
                Customer.email.ilike(s),
                Customer.phone.ilike(s),
                Customer.company_name.ilike(s),
                Customer.nip.ilike(s),
            )
        )
    cc = (country_code or "").strip().upper()
    if cc:
        q = q.filter(func.upper(func.trim(Customer.country_code)) == cc[:8])

    if has_orders is True:
        q = q.filter(
            exists().where(
                Order.customer_id == Customer.id,
                Order.tenant_id == Customer.tenant_id,
                Order.deleted_at.is_(None),
            )
        )
    elif has_orders is False:
        q = q.filter(
            ~exists().where(
                Order.customer_id == Customer.id,
                Order.tenant_id == Customer.tenant_id,
                Order.deleted_at.is_(None),
            )
        )

    if has_email is True:
        q = q.filter(func.length(func.trim(func.coalesce(Customer.email, ""))) > 0)
    elif has_email is False:
        q = q.filter(
            or_(
                Customer.email.is_(None),
                func.trim(func.coalesce(Customer.email, "")) == "",
            )
        )

    if has_phone is True:
        q = q.filter(func.length(func.trim(func.coalesce(Customer.phone, ""))) > 0)
    elif has_phone is False:
        q = q.filter(
            or_(
                Customer.phone.is_(None),
                func.trim(func.coalesce(Customer.phone, "")) == "",
            )
        )

    d_from = _parse_yyyy_mm_dd_customer(created_from)
    if d_from is not None:
        q = q.filter(Customer.created_at >= d_from)
    d_to = _parse_yyyy_mm_dd_customer(created_to)
    if d_to is not None:
        end_excl = d_to + timedelta(days=1)
        q = q.filter(Customer.created_at < end_excl)

    rows = q.order_by(Customer.id.desc()).all()
    out: List[CustomerListOut] = []
    for r in rows:
        out.append(
            CustomerListOut(
                id=int(r.id),
                tenant_id=int(r.tenant_id),
                display_name=_display_name(r),
                email=r.email,
                phone=r.phone,
                nip=r.nip,
                country_code=(r.country_code or "PL").strip().upper()[:8] or "PL",
            )
        )
    return out


@router.post("", response_model=CustomerDetailOut, status_code=201)
@router.post("/", response_model=CustomerDetailOut, status_code=201, include_in_schema=False)
def create_customer(body: CustomerCreate, db: Session = Depends(get_db)):
    _assert_shipping_method_for_tenant(db, tenant_id=body.tenant_id, method_id=body.preferred_shipping_method_id)
    row = Customer(
        tenant_id=int(body.tenant_id),
        first_name=(body.first_name or "").strip(),
        last_name=(body.last_name or "").strip(),
        phone=(body.phone or "").strip() or None,
        email=(body.email or "").strip() or None,
        company_name=(body.company_name or "").strip() or None,
        nip=(body.nip or "").strip() or None,
        country_code=(body.country_code or "PL").strip().upper()[:8] or "PL",
        default_document_type=str(body.default_document_type).strip().upper(),
        preferred_shipping_method_id=str(body.preferred_shipping_method_id).strip() if body.preferred_shipping_method_id else None,
        preferred_payment_method=(body.preferred_payment_method or "").strip() or None,
        global_discount_percent=float(body.global_discount_percent or 0),
    )
    db.add(row)
    db.flush()
    if body.addresses:
        _replace_addresses(db, int(row.id), body.addresses)
        _normalize_default_addresses(db, int(row.id))
        db.flush()
    if body.product_discounts:
        _replace_product_discounts(db, row, body.product_discounts)
    db.commit()
    row = _get_customer_or_404(db, int(row.id), int(body.tenant_id))
    logger.info("CUSTOMER created id=%s tenant=%s", row.id, body.tenant_id)
    return _customer_to_detail_out(db, row)


@router.post("/bulk-delete", response_model=EntityBulkDeleteResult)
def customers_bulk_delete(body: CustomerBulkDeleteBody, db: Session = Depends(get_db)):
    result = delete_customers_bulk_transaction(db, int(body.tenant_id), body.ids)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


@router.get("/{customer_id}", response_model=CustomerDetailOut)
def get_customer(
    customer_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = _get_customer_or_404(db, customer_id, tenant_id)
    return _customer_to_detail_out(db, row)


@router.patch("/{customer_id}", response_model=CustomerDetailOut)
def patch_customer(
    customer_id: int,
    body: CustomerUpdate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = _get_customer_or_404(db, customer_id, tenant_id)
    fields = getattr(body, "model_fields_set", None) or getattr(body, "__fields_set__", set())
    if "preferred_shipping_method_id" in fields:
        _assert_shipping_method_for_tenant(db, tenant_id=tenant_id, method_id=body.preferred_shipping_method_id)
    if "first_name" in fields and body.first_name is not None:
        row.first_name = str(body.first_name).strip()
    if "last_name" in fields and body.last_name is not None:
        row.last_name = str(body.last_name).strip()
    if "phone" in fields:
        row.phone = (body.phone or "").strip() or None
    if "email" in fields:
        row.email = (body.email or "").strip() or None
    if "company_name" in fields:
        row.company_name = (body.company_name or "").strip() or None
    if "nip" in fields:
        row.nip = (body.nip or "").strip() or None
    if "country_code" in fields and body.country_code is not None:
        row.country_code = str(body.country_code).strip().upper()[:8] or "PL"
    if "default_document_type" in fields and body.default_document_type is not None:
        row.default_document_type = str(body.default_document_type).strip().upper()
    if "preferred_shipping_method_id" in fields:
        row.preferred_shipping_method_id = (
            str(body.preferred_shipping_method_id).strip() if body.preferred_shipping_method_id else None
        )
    if "preferred_payment_method" in fields:
        row.preferred_payment_method = (body.preferred_payment_method or "").strip() or None
    if "global_discount_percent" in fields and body.global_discount_percent is not None:
        row.global_discount_percent = float(body.global_discount_percent)
    if "addresses" in fields and body.addresses is not None:
        _replace_addresses(db, int(row.id), body.addresses)
        _normalize_default_addresses(db, int(row.id))
    if "product_discounts" in fields and body.product_discounts is not None:
        _replace_product_discounts(db, row, body.product_discounts)
    db.add(row)
    db.commit()
    db.refresh(row)
    row = _get_customer_or_404(db, customer_id, tenant_id)
    return _customer_to_detail_out(db, row)


@router.delete("/{customer_id}", response_model=EntityBulkDeleteResult)
def delete_customer(
    customer_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    result = delete_customer_transaction(db, tenant_id, customer_id)
    if result.get("errors"):
        db.rollback()
    else:
        db.commit()
    return entity_bulk_delete_result_from_service_dict(result)


@router.get("/{customer_id}/addresses", response_model=List[CustomerAddressOut])
def list_customer_addresses(
    customer_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    _get_customer_or_404(db, customer_id, tenant_id)
    rows = (
        db.query(CustomerAddress)
        .filter(CustomerAddress.customer_id == int(customer_id))
        .order_by(CustomerAddress.id.asc())
        .all()
    )
    return [
        CustomerAddressOut(
            id=int(a.id),
            customer_id=int(a.customer_id),
            first_name=a.first_name or "",
            last_name=a.last_name or "",
            company_name=a.company_name,
            street=a.street or "",
            house_number=a.house_number or "",
            apartment_number=a.apartment_number,
            postal_code=a.postal_code or "",
            city=a.city or "",
            country_code=a.country_code or "PL",
            is_default=bool(a.is_default),
        )
        for a in rows
    ]


@router.post("/{customer_id}/addresses", response_model=CustomerAddressOut, status_code=201)
def add_customer_address(
    customer_id: int,
    body: CustomerAddressCreate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = _get_customer_or_404(db, customer_id, tenant_id)
    if body.is_default:
        db.query(CustomerAddress).filter(CustomerAddress.customer_id == int(customer_id)).update(
            {CustomerAddress.is_default: False},
            synchronize_session=False,
        )
    addr = CustomerAddress(
        customer_id=int(row.id),
        first_name=(body.first_name or "").strip(),
        last_name=(body.last_name or "").strip(),
        company_name=(body.company_name or "").strip() or None,
        street=(body.street or "").strip(),
        house_number=(body.house_number or "").strip(),
        apartment_number=(body.apartment_number or "").strip() or None,
        postal_code=(body.postal_code or "").strip(),
        city=(body.city or "").strip(),
        country_code=(body.country_code or "PL").strip().upper()[:8] or "PL",
        is_default=bool(body.is_default),
    )
    if not body.is_default:
        cnt = db.query(CustomerAddress).filter(CustomerAddress.customer_id == int(customer_id)).count()
        if cnt == 0:
            addr.is_default = True
    db.add(addr)
    db.commit()
    db.refresh(addr)
    return CustomerAddressOut(
        id=int(addr.id),
        customer_id=int(addr.customer_id),
        first_name=addr.first_name or "",
        last_name=addr.last_name or "",
        company_name=addr.company_name,
        street=addr.street or "",
        house_number=addr.house_number or "",
        apartment_number=addr.apartment_number,
        postal_code=addr.postal_code or "",
        city=addr.city or "",
        country_code=addr.country_code or "PL",
        is_default=bool(addr.is_default),
    )
