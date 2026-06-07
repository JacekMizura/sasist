"""Invoice customer — find by NIP or create in CRM, link to session."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.customer import Customer, CustomerAddress
from ..nip_lookup_service import normalize_polish_nip
from .retail_customer_service import is_retail_system_customer


def find_customer_by_nip(db: Session, *, tenant_id: int, nip: str) -> Customer | None:
    normalized = normalize_polish_nip(nip)
    if normalized is None:
        return None
    rows = (
        db.query(Customer)
        .filter(
            Customer.tenant_id == int(tenant_id),
            Customer.deleted_at.is_(None),
            Customer.nip.isnot(None),
        )
        .all()
    )
    for row in rows:
        raw = normalize_polish_nip(str(row.nip or ""))
        if raw == normalized:
            return row
    return None


def upsert_invoice_customer(
    db: Session,
    *,
    tenant_id: int,
    nip: str,
    company_name: str,
    street: str | None = None,
    postal_code: str | None = None,
    city: str | None = None,
) -> Customer:
    """Reuse existing CRM row by NIP or create a new B2B customer."""
    existing = find_customer_by_nip(db, tenant_id=tenant_id, nip=nip)
    if existing is not None and not is_retail_system_customer(existing):
        if company_name and not str(existing.company_name or "").strip():
            existing.company_name = company_name.strip()[:256]
        db.flush()
        return existing

    normalized = normalize_polish_nip(nip)
    if normalized is None:
        raise ValueError("Nieprawidłowy NIP.")

    row = Customer(
        tenant_id=int(tenant_id),
        first_name="",
        last_name="",
        company_name=str(company_name or "").strip()[:256] or f"Firma {normalized}",
        nip=normalized,
        default_document_type="INVOICE",
        global_discount_percent=0.0,
    )
    db.add(row)
    db.flush()

    if street or postal_code or city:
        addr = CustomerAddress(
            customer_id=int(row.id),
            company_name=row.company_name,
            street=str(street or "").strip()[:256] or "",
            postal_code=str(postal_code or "").strip()[:32] or "",
            city=str(city or "").strip()[:128] or "",
            is_default=True,
        )
        db.add(addr)
        db.flush()
    return row
