"""Match inbound sender to Customer — does NOT imply conversation threading."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ....models.customer import Customer


def find_customer_id_by_email(db: Session, *, tenant_id: int, email: str) -> int | None:
    normalized = (email or "").strip().lower()
    if not normalized or "@" not in normalized:
        return None
    match = (
        db.query(Customer.id)
        .filter(Customer.tenant_id == int(tenant_id))
        .filter(Customer.email.ilike(normalized))
        .first()
    )
    if match is None:
        return None
    return int(match[0])
