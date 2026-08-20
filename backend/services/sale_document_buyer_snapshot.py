"""Immutable buyer snapshot for SaleDocument — materialized at issuance (PA/FV)."""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy.orm import Session

from ..models.customer import Customer, CustomerAddress
from ..models.order import Order
from ..models.sale_document import SaleDocument
from .customers.customer_order_link_service import extract_order_customer_draft
from .retail_customer_service import (
    RETAIL_DISPLAY_NAME,
    customer_display_name,
    is_retail_system_customer,
)


def _digits_only(value: str | None) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _block(root: dict[str, Any], key: str) -> dict[str, Any]:
    raw = root.get(key)
    return raw if isinstance(raw, dict) else {}


def _first_str(block: dict[str, Any], *keys: str) -> str:
    for key in keys:
        val = block.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
    return ""


def _split_person_name(full: str) -> tuple[str, str]:
    s = full.strip()
    if not s:
        return "", ""
    parts = s.split(None, 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def _parse_street_parts(street_raw: str, house_raw: str = "") -> tuple[str, str, str | None]:
    street = street_raw.strip()
    house = house_raw.strip()
    apt: str | None = None
    if not house and street:
        m = re.match(r"^(.*?)\s+(\d+[A-Za-z]?)(?:/(\d+[A-Za-z]?))?$", street)
        if m:
            street = m.group(1).strip()
            house = m.group(2)
            apt = m.group(3)
    return street, house or "—", apt


def _extract_order_billing_buyer_draft(order: Order) -> dict[str, Any]:
    """Buyer draft from billing/customer blocks only — never shipping/delivery."""
    root: dict[str, Any] = {}
    if getattr(order, "addresses_json", None):
        try:
            parsed = json.loads(order.addresses_json)
            if isinstance(parsed, dict):
                root = parsed
        except (json.JSONDecodeError, TypeError):
            root = {}

    bill = _block(root, "billing")
    cust = _block(root, "customer")

    email = (_first_str(bill, "email", "mail", "Email") or _first_str(cust, "email", "mail")).strip().lower() or None
    phone = (
        _first_str(bill, "phone", "mobile", "tel", "Telefon")
        or _first_str(cust, "phone", "mobile", "tel")
    ).strip() or None

    company = (
        _first_str(bill, "company_name", "name", "firma", "Firma", "Nazwa")
        or _first_str(cust, "company_name", "company", "firma")
    )
    nip_raw = _digits_only(_first_str(bill, "nip", "NIP", "tax_id") or _first_str(cust, "nip", "NIP"))
    nip = nip_raw if len(nip_raw) >= 10 else None

    person = _first_str(bill, "name") or _first_str(cust, "name")
    if not person:
        fn = _first_str(bill, "Imię", "first_name") or _first_str(cust, "Imię", "first_name")
        ln = _first_str(bill, "Nazwisko", "last_name") or _first_str(cust, "Nazwisko", "last_name")
        person = " ".join(p for p in (fn, ln) if p).strip()
    first_name, last_name = _split_person_name(person)

    street_src = _first_str(bill, "street", "street_name", "Ulica", "address") or _first_str(
        cust, "street", "street_name", "Ulica", "address"
    )
    house_src = _first_str(bill, "house_number", "NrNieruchomosci") or _first_str(cust, "house_number")
    postal = _first_str(bill, "postal_code", "postcode", "zip", "Kod pocztowy") or _first_str(
        cust, "postal_code", "postcode", "zip"
    )
    city = _first_str(bill, "city", "Miejscowosc") or _first_str(cust, "city", "Miejscowosc")
    country = (_first_str(bill, "country", "Kraj") or _first_str(cust, "country", "Kraj") or "PL").upper()[:8]

    street, house_number, apartment_number = _parse_street_parts(street_src, house_src)

    addresses: list[dict[str, Any]] = []
    if street or city or postal:
        addresses.append(
            {
                "street": street or "—",
                "house_number": house_number,
                "apartment_number": apartment_number,
                "postal_code": postal or "00-000",
                "city": city or "—",
                "country_code": country or "PL",
            }
        )

    return {
        "first_name": first_name or company or "",
        "last_name": last_name or "",
        "phone": phone,
        "email": email,
        "company_name": company or None,
        "nip": nip,
        "country_code": country or "PL",
        "addresses": addresses,
        "source": "billing" if bill else ("customer" if cust else None),
    }


def parse_buyer_snapshot(raw: str | None) -> dict[str, Any] | None:
    if not str(raw or "").strip():
        return None
    try:
        parsed = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None
    return parsed if isinstance(parsed, dict) else None


def serialize_buyer_snapshot(snapshot: dict[str, Any]) -> str:
    return json.dumps(snapshot, ensure_ascii=False)


def _address_dict_from_customer_address(addr: CustomerAddress | None) -> dict[str, Any] | None:
    if addr is None:
        return None
    street = str(getattr(addr, "street", None) or "").strip()
    house = str(getattr(addr, "house_number", None) or "").strip()
    apt = str(getattr(addr, "apartment_number", None) or "").strip() or None
    postal = str(getattr(addr, "postal_code", None) or "").strip()
    city = str(getattr(addr, "city", None) or "").strip()
    country = str(getattr(addr, "country_code", None) or "PL").strip() or "PL"
    if not any((street, house, postal, city)):
        return None
    return {
        "street": street,
        "house_number": house or None,
        "apartment_number": apt,
        "postal_code": postal or None,
        "city": city or None,
        "country_code": country,
    }


def _address_dict_from_draft(draft: dict[str, Any]) -> dict[str, Any] | None:
    addrs = draft.get("addresses")
    if not isinstance(addrs, list) or not addrs:
        return None
    first = addrs[0]
    if not isinstance(first, dict):
        return None
    street = str(first.get("street") or "").strip()
    house = str(first.get("house_number") or "").strip()
    apt = str(first.get("apartment_number") or "").strip() or None
    postal = str(first.get("postal_code") or "").strip()
    city = str(first.get("city") or "").strip()
    country = str(first.get("country_code") or "PL").strip() or "PL"
    if not any((street, house, postal, city)):
        return None
    return {
        "street": street,
        "house_number": house or None,
        "apartment_number": apt,
        "postal_code": postal or None,
        "city": city or None,
        "country_code": country,
    }


def _display_name_from_parts(
    *,
    company_name: str | None,
    first_name: str | None,
    last_name: str | None,
) -> str:
    company = str(company_name or "").strip()
    if company:
        return company
    name = " ".join(p for p in (str(first_name or "").strip(), str(last_name or "").strip()) if p).strip()
    return name or "—"


def _format_address_line(addr: dict[str, Any] | None) -> str | None:
    if not addr:
        return None
    street = str(addr.get("street") or "").strip()
    house = str(addr.get("house_number") or "").strip()
    apt = str(addr.get("apartment_number") or "").strip()
    street_line = street
    if house:
        street_line = f"{street_line} {house}".strip() if street_line else house
    if apt:
        street_line = f"{street_line}/{apt}".strip() if street_line else apt
    city = str(addr.get("city") or "").strip()
    postal = str(addr.get("postal_code") or "").strip()
    city_line = " ".join(p for p in (postal, city) if p).strip()
    parts = [p for p in (street_line, city_line) if p]
    return ", ".join(parts) if parts else None


def buyer_snapshot_to_display(snapshot: dict[str, Any]) -> dict[str, Any]:
    """Map persisted buyer_json → mapper / PDF display DTO."""
    addr = snapshot.get("address")
    addr_dict = addr if isinstance(addr, dict) else None
    name = str(snapshot.get("name") or "").strip() or _display_name_from_parts(
        company_name=snapshot.get("company_name"),
        first_name=snapshot.get("first_name"),
        last_name=snapshot.get("last_name"),
    )
    return {
        "id": snapshot.get("customer_id"),
        "name": name or "—",
        "nip": str(snapshot.get("nip") or "").strip() or None,
        "email": str(snapshot.get("email") or "").strip() or None,
        "phone": str(snapshot.get("phone") or "").strip() or None,
        "address": _format_address_line(addr_dict),
        "street": str(addr_dict.get("street") or "").strip() if addr_dict else None,
        "house_number": str(addr_dict.get("house_number") or "").strip() if addr_dict else None,
        "apartment_number": str(addr_dict.get("apartment_number") or "").strip() if addr_dict else None,
        "city": str(addr_dict.get("city") or "").strip() if addr_dict else None,
        "zip": str(addr_dict.get("postal_code") or "").strip() if addr_dict else None,
        "postal_code": str(addr_dict.get("postal_code") or "").strip() if addr_dict else None,
        "country": str(addr_dict.get("country_code") or "").strip() if addr_dict else None,
    }


def _order_snapshot_is_complete(draft: dict[str, Any], *, panel_document_type: str) -> bool:
    if not draft.get("source"):
        return False
    company = str(draft.get("company_name") or "").strip()
    fn = str(draft.get("first_name") or "").strip()
    ln = str(draft.get("last_name") or "").strip()
    nip = str(draft.get("nip") or "").strip()
    has_identity = bool(company) or (
        bool(fn) and fn not in {"Klient", "—"}
    ) or bool(ln and ln not in {"—"})
    if not has_identity:
        return False
    panel = str(panel_document_type or "").strip().upper()
    if panel == "INVOICE":
        return bool(nip or company)
    return True


def _snapshot_from_order_draft(
    draft: dict[str, Any],
    *,
    order: Order,
    panel_document_type: str,
) -> dict[str, Any]:
    company = str(draft.get("company_name") or "").strip() or None
    first_name = str(draft.get("first_name") or "").strip() or None
    last_name = str(draft.get("last_name") or "").strip() or None
    if last_name in {"—"}:
        last_name = None
    if first_name in {"Klient"} and company:
        first_name = None
    name = _display_name_from_parts(company_name=company, first_name=first_name, last_name=last_name)
    return {
        "customer_id": getattr(order, "customer_id", None),
        "name": name,
        "company_name": company,
        "first_name": first_name,
        "last_name": last_name,
        "nip": str(draft.get("nip") or "").strip() or None,
        "email": str(draft.get("email") or "").strip() or None,
        "phone": str(draft.get("phone") or "").strip() or None,
        "address": _address_dict_from_draft(draft),
    }


def _load_customer_address(db: Session, customer: Customer) -> CustomerAddress | None:
    addrs = getattr(customer, "addresses", None)
    if addrs is None:
        addrs = (
            db.query(CustomerAddress)
            .filter(CustomerAddress.customer_id == int(customer.id))
            .order_by(CustomerAddress.id.asc())
            .all()
        )
    else:
        addrs = list(addrs)
    if not addrs:
        return None
    for row in addrs:
        if bool(getattr(row, "is_default", False)):
            return row
    return addrs[0]


def _snapshot_from_customer(db: Session, customer: Customer) -> dict[str, Any]:
    if is_retail_system_customer(customer):
        return {
            "customer_id": int(customer.id),
            "name": RETAIL_DISPLAY_NAME,
            "company_name": RETAIL_DISPLAY_NAME,
            "first_name": RETAIL_DISPLAY_NAME,
            "last_name": "",
            "nip": None,
            "email": str(getattr(customer, "email", None) or "").strip() or None,
            "phone": str(getattr(customer, "phone", None) or "").strip() or None,
            "address": None,
        }

    addr = _load_customer_address(db, customer)
    addr_from_customer = _address_dict_from_customer_address(addr)
    company = str(getattr(customer, "company_name", None) or "").strip() or None
    first_name = str(getattr(customer, "first_name", None) or "").strip() or None
    last_name = str(getattr(customer, "last_name", None) or "").strip() or None
    name = customer_display_name(customer) or _display_name_from_parts(
        company_name=company,
        first_name=first_name,
        last_name=last_name,
    )
    return {
        "customer_id": int(customer.id),
        "name": name,
        "company_name": company,
        "first_name": first_name,
        "last_name": last_name,
        "nip": str(getattr(customer, "nip", None) or "").strip() or None,
        "email": str(getattr(customer, "email", None) or "").strip() or None,
        "phone": str(getattr(customer, "phone", None) or "").strip() or None,
        "address": addr_from_customer,
    }


def _snapshot_retail_fallback(*, customer_id: int | None = None) -> dict[str, Any]:
    return {
        "customer_id": customer_id,
        "name": RETAIL_DISPLAY_NAME,
        "company_name": RETAIL_DISPLAY_NAME,
        "first_name": RETAIL_DISPLAY_NAME,
        "last_name": "",
        "nip": None,
        "email": None,
        "phone": None,
        "address": None,
    }


def build_buyer_snapshot(
    db: Session,
    *,
    order: Order,
    customer: Customer | None,
    panel_document_type: str,
) -> dict[str, Any]:
    """
    Resolve buyer at document issuance.

    Precedence:
    1. Complete historical buyer on Order (billing/customer in addresses_json)
    2. Customer + CustomerAddress
    3. Retail / minimal fallback

    INVOICE never uses shipping/delivery blocks as buyer source.
    """
    panel = str(panel_document_type or "").strip().upper()
    if panel == "INVOICE":
        draft = _extract_order_billing_buyer_draft(order)
    else:
        draft = extract_order_customer_draft(order)
        draft = {**draft, "source": "order"}

    if _order_snapshot_is_complete(draft, panel_document_type=panel_document_type):
        return _snapshot_from_order_draft(draft, order=order, panel_document_type=panel_document_type)

    if customer is not None:
        return _snapshot_from_customer(db, customer)

    return _snapshot_retail_fallback(customer_id=getattr(order, "customer_id", None))


def persist_buyer_snapshot(
    db: Session,
    *,
    row: SaleDocument,
    order: Order,
    panel_document_type: str,
    customer: Customer | None = None,
) -> None:
    if customer is None and getattr(order, "customer_id", None):
        customer = db.query(Customer).filter(Customer.id == int(order.customer_id)).first()
    snapshot = build_buyer_snapshot(
        db,
        order=order,
        customer=customer,
        panel_document_type=panel_document_type,
    )
    row.buyer_json = serialize_buyer_snapshot(snapshot)
