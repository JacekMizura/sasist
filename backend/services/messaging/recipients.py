"""Customer email resolution for ORDER / RETURN / COMPLAINT — single SSOT."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ...models.customer import Customer
from ...models.order import Order
from ...models.wms_order_return import WmsOrderReturn
from ..automation.constants import ENTITY_COMPLAINT, ENTITY_ORDER, ENTITY_RETURN

_RETAIL_INTERNAL_SUFFIX = "@retail.system.internal"


@dataclass
class RecipientResolution:
    ok: bool
    email: Optional[str] = None
    error_code: Optional[str] = None
    message: str = ""
    source: Optional[str] = None


def _clean_email(raw: object) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or "@" not in s:
        return None
    if s.lower().endswith(_RETAIL_INTERNAL_SUFFIX):
        return None
    return s


def _email_from_addresses_json(raw: object) -> Optional[str]:
    if raw is None or not str(raw).strip():
        return None
    try:
        data = json.loads(raw) if not isinstance(raw, dict) else raw
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    billing = data.get("billing") if isinstance(data.get("billing"), dict) else {}
    shipping = data.get("shipping") if isinstance(data.get("shipping"), dict) else {}
    customer = data.get("customer") if isinstance(data.get("customer"), dict) else {}

    for block in (billing, shipping, customer, data):
        if not isinstance(block, dict):
            continue
        for key in ("Email", "email", "mail", "e_mail", "E-mail"):
            em = _clean_email(block.get(key))
            if em:
                return em
    # Deep search for email-like values
    for v in data.values():
        if isinstance(v, dict):
            nested = _email_from_addresses_json(json.dumps(v))
            if nested:
                return nested
    return None


def resolve_order_customer_email(db: Session, order: Order) -> RecipientResolution:
    em = _email_from_addresses_json(getattr(order, "addresses_json", None))
    if em:
        return RecipientResolution(ok=True, email=em, source="order.addresses_json")
    cust_id = getattr(order, "customer_id", None)
    if cust_id:
        row = (
            db.query(Customer)
            .filter(Customer.id == int(cust_id), Customer.tenant_id == int(order.tenant_id))
            .first()
        )
        if row is not None:
            em2 = _clean_email(getattr(row, "email", None))
            if em2:
                return RecipientResolution(ok=True, email=em2, source="customer.email")
    return RecipientResolution(
        ok=False,
        error_code="recipient_email_missing",
        message="Order has no customer email",
    )


def resolve_customer_email(
    db: Session,
    *,
    tenant_id: int,
    entity_type: str,
    entity_id: int,
) -> RecipientResolution:
    et = str(entity_type).upper()
    if et == ENTITY_ORDER:
        order = (
            db.query(Order)
            .filter(Order.id == int(entity_id), Order.tenant_id == int(tenant_id))
            .first()
        )
        if order is None:
            return RecipientResolution(ok=False, error_code="entity_not_found", message="Order not found")
        return resolve_order_customer_email(db, order)

    if et == ENTITY_RETURN:
        row = (
            db.query(WmsOrderReturn)
            .filter(WmsOrderReturn.id == int(entity_id), WmsOrderReturn.tenant_id == int(tenant_id))
            .first()
        )
        if row is None:
            return RecipientResolution(ok=False, error_code="entity_not_found", message="Return not found")
        if not getattr(row, "order_id", None):
            return RecipientResolution(
                ok=False,
                error_code="recipient_email_missing",
                message="Return has no linked order email",
            )
        order = (
            db.query(Order)
            .filter(Order.id == int(row.order_id), Order.tenant_id == int(tenant_id))
            .first()
        )
        if order is None:
            return RecipientResolution(
                ok=False,
                error_code="recipient_email_missing",
                message="Return linked order not found",
            )
        return resolve_order_customer_email(db, order)

    if et == ENTITY_COMPLAINT:
        c = (
            db.query(Complaint)
            .filter(Complaint.id == int(entity_id), Complaint.tenant_id == int(tenant_id))
            .first()
        )
        if c is None:
            return RecipientResolution(ok=False, error_code="entity_not_found", message="Complaint not found")
        em = _clean_email(getattr(c, "customer_email", None))
        if em:
            return RecipientResolution(ok=True, email=em, source="complaint.customer_email")
        if getattr(c, "order_id", None):
            order = (
                db.query(Order)
                .filter(Order.id == int(c.order_id), Order.tenant_id == int(tenant_id))
                .first()
            )
            if order is not None:
                return resolve_order_customer_email(db, order)
        return RecipientResolution(
            ok=False,
            error_code="recipient_email_missing",
            message="Complaint has no customer email",
        )

    return RecipientResolution(
        ok=False,
        error_code="unsupported_entity",
        message=f"Unsupported entity_type={et}",
    )


def resolve_internal_user_email(db: Session, *, user_id: int) -> RecipientResolution:
    """INTERNAL recipient SSOT — AppUser.email by id (no free-text address)."""
    from ...models.app_user import AppUser

    if int(user_id) <= 0:
        return RecipientResolution(
            ok=False,
            error_code="invalid_user_id",
            message="INTERNAL send_email requires user_id",
        )
    user = db.query(AppUser).filter(AppUser.id == int(user_id)).first()
    if user is None:
        return RecipientResolution(ok=False, error_code="user_not_found", message="User not found")
    if not bool(getattr(user, "is_active", True)):
        return RecipientResolution(ok=False, error_code="user_inactive", message="User is inactive")
    em = _clean_email(getattr(user, "email", None))
    if not em:
        return RecipientResolution(
            ok=False,
            error_code="recipient_email_missing",
            message="User has no email",
        )
    return RecipientResolution(ok=True, email=em, source="app_user.email")
