"""CRUD for suppliers (dostawcy), tenant-scoped."""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..catalog.supplier_taxonomy import country_is_eu, list_country_choices, list_currency_choices
from ..database import get_db
from ..models.inbound_delivery import InboundDelivery
from ..models.supplier import Supplier
from ..schemas.supplier import SupplierCreateBody, SupplierRead, SupplierUpdateBody

router = APIRouter(prefix="/suppliers", tags=["Suppliers"])


@router.get("/taxonomy")
def get_supplier_taxonomy():
    """Allowed countries (with EU flag) and currencies — aligned with ``catalog.supplier_taxonomy`` validators."""
    return {
        "countries": list_country_choices(),
        "currencies": [{"code": c} for c in list_currency_choices()],
    }


def _strip_opt(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    t = str(s).strip()
    return t or None


def _delivery_counts(db: Session, tenant_id: int, ids: List[int]) -> Dict[int, int]:
    if not ids:
        return {}
    rows = (
        db.query(InboundDelivery.supplier_id, func.count(InboundDelivery.id))
        .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.supplier_id.in_(ids))
        .group_by(InboundDelivery.supplier_id)
        .all()
    )
    return {int(sid): int(c or 0) for sid, c in rows if sid is not None}


def _serialize(s: Supplier, delivery_count: int) -> SupplierRead:
    mov = getattr(s, "minimum_order_value", None)
    mov_f = float(mov) if mov is not None else None
    ctry = _strip_opt(getattr(s, "country", None))
    return SupplierRead(
        id=s.id,
        tenant_id=s.tenant_id,
        name=s.name,
        company_name=_strip_opt(getattr(s, "company_name", None)),
        tax_id=_strip_opt(getattr(s, "tax_id", None)),
        email=_strip_opt(getattr(s, "email", None)),
        phone=_strip_opt(getattr(s, "phone", None)),
        website=_strip_opt(getattr(s, "website", None)),
        country=ctry,
        city=_strip_opt(getattr(s, "city", None)),
        postal_code=_strip_opt(getattr(s, "postal_code", None)),
        street=_strip_opt(getattr(s, "street", None)),
        address=_strip_opt(getattr(s, "address", None)),
        active=bool(s.active),
        default_lead_time_days=getattr(s, "default_lead_time_days", None),
        default_currency=_strip_opt(getattr(s, "default_currency", None)),
        minimum_order_value=round(mov_f, 2) if mov_f is not None else None,
        minimum_order_qty=getattr(s, "minimum_order_qty", None),
        free_shipping_threshold=(
            round(float(getattr(s, "free_shipping_threshold")), 2)
            if getattr(s, "free_shipping_threshold", None) is not None
            else None
        ),
        offers_free_shipping=bool(getattr(s, "offers_free_shipping", True)),
        requires_moq=bool(getattr(s, "requires_moq", True)),
        notes=_strip_opt(getattr(s, "notes", None)),
        delivery_count=int(delivery_count),
        is_incomplete=bool(getattr(s, "is_incomplete", False)),
        country_is_eu=country_is_eu(ctry),
    )


@router.get("/", response_model=List[SupplierRead])
def list_suppliers(
    tenant_id: int = Query(..., ge=1),
    name: Optional[str] = Query(None),
    status: str = Query("all", description="all | active | inactive"),
    sort_by: str = Query("name", description="name only"),
    sort_dir: str = Query("asc", description="asc | desc"),
    db: Session = Depends(get_db),
):
    q = db.query(Supplier).filter(Supplier.tenant_id == tenant_id)
    st = (status or "all").strip().lower()
    if st == "active":
        q = q.filter(Supplier.active.is_(True))
    elif st == "inactive":
        q = q.filter(Supplier.active.is_(False))
    if name and name.strip():
        term = f"%{name.strip()}%"
        q = q.filter(
            or_(
                Supplier.name.ilike(term),
                Supplier.company_name.ilike(term),
                Supplier.tax_id.ilike(term),
            )
        )
    rows = q.all()
    ids = [s.id for s in rows]
    counts = _delivery_counts(db, tenant_id, ids)
    out = [_serialize(s, counts.get(s.id, 0)) for s in rows]
    rev = (sort_dir or "asc").strip().lower() == "desc"
    out.sort(key=lambda r: (r.name or "").lower(), reverse=rev)
    return out


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
    return _serialize(s, int(cnt or 0))


@router.post("/", response_model=SupplierRead, status_code=201)
def create_supplier(body: SupplierCreateBody, db: Session = Depends(get_db)):
    s = Supplier(
        tenant_id=body.tenant_id,
        name=body.name.strip(),
        company_name=_strip_opt(body.company_name),
        tax_id=_strip_opt(body.tax_id),
        email=_strip_opt(body.email),
        phone=_strip_opt(body.phone),
        website=_strip_opt(body.website),
        country=_strip_opt(body.country),
        city=_strip_opt(body.city),
        postal_code=_strip_opt(body.postal_code),
        street=_strip_opt(body.street),
        address=_strip_opt(body.address),
        active=bool(body.active),
        default_lead_time_days=body.default_lead_time_days,
        default_currency=body.default_currency,
        minimum_order_value=(body.minimum_order_value if body.requires_moq else None),
        minimum_order_qty=(body.minimum_order_qty if body.requires_moq else None),
        free_shipping_threshold=(body.free_shipping_threshold if body.offers_free_shipping else None),
        offers_free_shipping=bool(body.offers_free_shipping),
        requires_moq=bool(body.requires_moq),
        notes=_strip_opt(body.notes),
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize(s, 0)


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
    s.company_name = _strip_opt(body.company_name)
    s.tax_id = _strip_opt(body.tax_id)
    s.email = _strip_opt(body.email)
    s.phone = _strip_opt(body.phone)
    s.website = _strip_opt(body.website)
    s.country = _strip_opt(body.country)
    s.city = _strip_opt(body.city)
    s.postal_code = _strip_opt(body.postal_code)
    s.street = _strip_opt(body.street)
    s.address = _strip_opt(body.address)
    s.active = bool(body.active)
    s.default_lead_time_days = body.default_lead_time_days
    s.default_currency = body.default_currency
    s.offers_free_shipping = bool(body.offers_free_shipping)
    s.requires_moq = bool(body.requires_moq)
    s.minimum_order_value = body.minimum_order_value if body.requires_moq else None
    s.minimum_order_qty = body.minimum_order_qty if body.requires_moq else None
    s.free_shipping_threshold = body.free_shipping_threshold if body.offers_free_shipping else None
    s.notes = _strip_opt(body.notes)
    db.commit()
    db.refresh(s)
    cnt = (
        db.query(func.count(InboundDelivery.id))
        .filter(InboundDelivery.supplier_id == s.id, InboundDelivery.tenant_id == tenant_id)
        .scalar()
    )
    return _serialize(s, int(cnt or 0))


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
