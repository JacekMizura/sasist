"""System retail customer — auto-assigned for anonymous POS / paragon sales."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.customer import Customer

RETAIL_CUSTOMER_EMAIL_SUFFIX = "@retail.system.internal"
RETAIL_DISPLAY_NAME = "Klient detaliczny"


def _retail_customer_email(tenant_id: int) -> str:
    return f"retail+{int(tenant_id)}{RETAIL_CUSTOMER_EMAIL_SUFFIX}"


def is_retail_system_customer(customer: Customer | None) -> bool:
    if customer is None:
        return False
    email = str(getattr(customer, "email", None) or "").strip().lower()
    return email.endswith(RETAIL_CUSTOMER_EMAIL_SUFFIX) and email.startswith("retail+")


def ensure_retail_customer(db: Session, *, tenant_id: int) -> Customer:
    """Idempotent — one hidden retail customer per tenant."""
    email = _retail_customer_email(tenant_id)
    row = (
        db.query(Customer)
        .filter(
            Customer.tenant_id == int(tenant_id),
            Customer.email == email,
            Customer.deleted_at.is_(None),
        )
        .first()
    )
    if row is not None:
        return row

    row = Customer(
        tenant_id=int(tenant_id),
        first_name=RETAIL_DISPLAY_NAME,
        last_name="",
        company_name=RETAIL_DISPLAY_NAME,
        email=email,
        default_document_type="RECEIPT",
        global_discount_percent=0.0,
    )
    db.add(row)
    db.flush()
    return row


def customer_display_name(customer: Customer | None) -> str | None:
    if customer is None:
        return None
    if is_retail_system_customer(customer):
        return RETAIL_DISPLAY_NAME
    company = str(getattr(customer, "company_name", None) or "").strip()
    if company:
        return company
    fn = str(getattr(customer, "first_name", None) or "").strip()
    ln = str(getattr(customer, "last_name", None) or "").strip()
    name = " ".join(p for p in (fn, ln) if p).strip()
    return name or None
