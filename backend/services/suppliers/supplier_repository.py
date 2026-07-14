"""Database access for supplier list queries."""

from __future__ import annotations

from typing import List, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Query, Session

from ...models.supplier import Supplier


def build_supplier_list_query(
    db: Session,
    *,
    tenant_id: int,
    name: Optional[str] = None,
    country: Optional[str] = None,
    city: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    currency: Optional[str] = None,
    requires_moq: Optional[bool] = None,
    offers_free_shipping: Optional[bool] = None,
    status: str = "all",
) -> Query:
    q = db.query(Supplier).filter(Supplier.tenant_id == int(tenant_id))
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
    if country and country.strip():
        q = q.filter(Supplier.country.ilike(f"%{country.strip()}%"))
    if city and city.strip():
        q = q.filter(Supplier.city.ilike(f"%{city.strip()}%"))
    if email and email.strip():
        q = q.filter(Supplier.email.ilike(f"%{email.strip()}%"))
    if phone and phone.strip():
        q = q.filter(Supplier.phone.ilike(f"%{phone.strip()}%"))
    if currency and currency.strip():
        q = q.filter(Supplier.default_currency.ilike(f"%{currency.strip()}%"))
    if requires_moq is not None:
        q = q.filter(Supplier.requires_moq.is_(bool(requires_moq)))
    if offers_free_shipping is not None:
        q = q.filter(Supplier.offers_free_shipping.is_(bool(offers_free_shipping)))
    return q


def fetch_supplier_rows(db: Session, query: Query) -> List[Supplier]:
    return query.all()
