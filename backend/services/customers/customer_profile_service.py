"""Customer CRM profile — type, status, flags, timeline events."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.customer import Customer
from ...models.customer_crm import CustomerCrmEvent
from .customer_constants import (
    CUSTOMER_FLAGS,
    CUSTOMER_STATUS_DEFAULT,
    CUSTOMER_TYPE_DEFAULT,
    SALES_CHANNEL_DEFAULT,
    dump_customer_flags,
    infer_customer_type,
    infer_sales_channel,
    merge_customer_flags,
    normalize_customer_status,
    normalize_customer_type,
    normalize_sales_channel,
    parse_customer_flags,
    resolve_customer_type_input,
)
from .errors import CustomerNotFoundError


class CustomerProfileError(ValueError):
    def __init__(self, message: str, *, code: str = "invalid_profile"):
        super().__init__(message)
        self.message = message
        self.code = code


def _get_customer(db: Session, *, customer_id: int, tenant_id: int) -> Customer:
    row = (
        db.query(Customer)
        .filter(
            Customer.id == int(customer_id),
            Customer.tenant_id == int(tenant_id),
            Customer.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise CustomerNotFoundError()
    return row


def get_customer_row(db: Session, *, customer_id: int, tenant_id: int) -> Customer:
    return _get_customer(db, customer_id=customer_id, tenant_id=tenant_id)


def customer_profile_dict(customer: Customer) -> dict[str, Any]:
    flags = parse_customer_flags(getattr(customer, "flags_json", None))
    ctype = infer_customer_type(customer)
    status = normalize_customer_status(getattr(customer, "customer_status", None))
    channel = infer_sales_channel(customer)
    if getattr(customer, "deleted_at", None):
        status = "archived"
    return {
        "customer_type": ctype,
        "customer_status": status,
        "sales_channel": channel,
        "flags": flags,
        "credit_limit_gross": float(customer.credit_limit_gross)
        if getattr(customer, "credit_limit_gross", None) is not None
        else None,
        "payment_terms_days": int(customer.payment_terms_days)
        if getattr(customer, "payment_terms_days", None) is not None
        else None,
        "account_manager_user_id": int(customer.account_manager_user_id)
        if getattr(customer, "account_manager_user_id", None)
        else None,
    }


def record_customer_crm_event(
    db: Session,
    *,
    tenant_id: int,
    customer_id: int,
    event_type: str,
    event_label: str,
    summary: str,
    performed_by_user_id: int | None = None,
    payload: dict[str, Any] | None = None,
) -> CustomerCrmEvent:
    row = CustomerCrmEvent(
        tenant_id=int(tenant_id),
        customer_id=int(customer_id),
        event_type=str(event_type).strip().upper(),
        event_label=str(event_label or event_type).strip(),
        summary=str(summary or "").strip() or str(event_label or event_type),
        payload_json=json.dumps(payload or {}, ensure_ascii=False, default=str) if payload else None,
        performed_by_user_id=int(performed_by_user_id) if performed_by_user_id else None,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def patch_customer_crm_profile(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    performed_by_user_id: int | None = None,
    customer_type: str | None = None,
    customer_status: str | None = None,
    sales_channel: str | None = None,
    flags: dict[str, bool] | None = None,
    credit_limit_gross: float | None = None,
    payment_terms_days: int | None = None,
    account_manager_user_id: int | None = None,
    clear_credit_limit: bool = False,
    clear_payment_terms: bool = False,
    clear_account_manager: bool = False,
) -> Customer:
    row = _get_customer(db, customer_id=customer_id, tenant_id=tenant_id)
    events: list[tuple[str, str, str, dict[str, Any] | None]] = []

    if customer_type is not None:
        new_type, type_flags = resolve_customer_type_input(customer_type)
        old_type = infer_customer_type(row)
        if new_type != old_type:
            row.customer_type = new_type
            events.append(
                (
                    "PROFILE_TYPE_CHANGED",
                    "Typ klienta",
                    f"Typ: {old_type} → {new_type}",
                    {"from": old_type, "to": new_type},
                )
            )
        if type_flags:
            current = parse_customer_flags(getattr(row, "flags_json", None))
            row.flags_json = dump_customer_flags(merge_customer_flags(current, type_flags))

    if sales_channel is not None:
        new_channel = normalize_sales_channel(sales_channel)
        old_channel = infer_sales_channel(row)
        if new_channel != old_channel:
            row.sales_channel = new_channel
            events.append(
                (
                    "PROFILE_CHANNEL_CHANGED",
                    "Kanał sprzedaży",
                    f"Kanał: {old_channel} → {new_channel}",
                    {"from": old_channel, "to": new_channel},
                )
            )

    if customer_status is not None:
        new_status = normalize_customer_status(customer_status)
        old_status = normalize_customer_status(getattr(row, "customer_status", None))
        if new_status != old_status:
            row.customer_status = new_status
            label = {
                "active": "Aktywny",
                "blocked": "Zablokowany",
                "archived": "Zarchiwizowany",
            }.get(new_status, new_status)
            events.append(
                (
                    "PROFILE_STATUS_CHANGED",
                    "Status klienta",
                    f"Status: {label}",
                    {"from": old_status, "to": new_status},
                )
            )

    if flags is not None:
        current = parse_customer_flags(getattr(row, "flags_json", None))
        merged = merge_customer_flags(current, {k: bool(v) for k, v in flags.items() if k in CUSTOMER_FLAGS})
        row.flags_json = dump_customer_flags(merged)
        if "vip" in flags:
            if flags["vip"]:
                events.append(("VIP_MARKED", "VIP", "Klient oznaczony jako VIP", None))
            else:
                events.append(("VIP_REMOVED", "VIP", "Usunięto oznaczenie VIP", None))
        if "debtor" in flags:
            if flags["debtor"]:
                events.append(("DEBTOR_MARKED", "Dłużnik", "Klient oznaczony jako dłużnik", None))
            else:
                events.append(("DEBTOR_REMOVED", "Dłużnik", "Usunięto oznaczenie dłużnika", None))

    if clear_credit_limit:
        row.credit_limit_gross = None
    elif credit_limit_gross is not None:
        row.credit_limit_gross = max(0.0, float(credit_limit_gross))

    if clear_payment_terms:
        row.payment_terms_days = None
    elif payment_terms_days is not None:
        row.payment_terms_days = max(0, int(payment_terms_days))

    if clear_account_manager:
        row.account_manager_user_id = None
    elif account_manager_user_id is not None:
        row.account_manager_user_id = int(account_manager_user_id) if account_manager_user_id > 0 else None

    row.updated_at = datetime.utcnow()
    for event_type, event_label, summary, payload in events:
        record_customer_crm_event(
            db,
            tenant_id=tenant_id,
            customer_id=customer_id,
            event_type=event_type,
            event_label=event_label,
            summary=summary,
            performed_by_user_id=performed_by_user_id,
            payload=payload,
        )
    db.flush()
    return row


def apply_customer_crm_action(
    db: Session,
    *,
    customer_id: int,
    tenant_id: int,
    action: str,
    performed_by_user_id: int | None = None,
) -> Customer:
    act = str(action or "").strip().lower()
    mapping = {
        "mark_vip": {"flags": {"vip": True}},
        "unmark_vip": {"flags": {"vip": False}},
        "mark_debtor": {"flags": {"debtor": True}},
        "unmark_debtor": {"flags": {"debtor": False}},
        "block": {"customer_status": "blocked"},
        "unblock": {"customer_status": "active"},
    }
    payload = mapping.get(act)
    if payload is None:
        raise CustomerProfileError(f"Nieznana akcja: {action}", code="unknown_action")
    return patch_customer_crm_profile(
        db,
        customer_id=customer_id,
        tenant_id=tenant_id,
        performed_by_user_id=performed_by_user_id,
        **payload,
    )


def ensure_customer_profile_defaults(db: Session, customer: Customer) -> None:
    if not getattr(customer, "customer_type", None):
        customer.customer_type = infer_customer_type(customer)
    else:
        customer.customer_type = normalize_customer_type(customer.customer_type)
    if not getattr(customer, "customer_status", None):
        customer.customer_status = CUSTOMER_STATUS_DEFAULT
    if not getattr(customer, "sales_channel", None):
        customer.sales_channel = SALES_CHANNEL_DEFAULT
    if getattr(customer, "flags_json", None) is None:
        customer.flags_json = dump_customer_flags({})
