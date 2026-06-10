"""Tworzenie / łączenie klienta z danych zamówienia — wykrywanie duplikatów."""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...models.customer import Customer, CustomerAddress
from ...models.order import Order
from ...schemas.customer import CustomerAddressCreate


class CustomerOrderLinkError(Exception):
    def __init__(self, code: str, message: str) -> None:
        self.code = code
        self.message = message
        super().__init__(message)


def _digits_only(value: str | None) -> str:
    return re.sub(r"\D", "", str(value or ""))


def _norm_email(value: str | None) -> str | None:
    s = str(value or "").strip().lower()
    return s or None


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


def extract_order_customer_draft(order: Order) -> dict[str, Any]:
    """Mapuje nagłówek zamówienia + addresses_json na payload klienta."""
    root: dict[str, Any] = {}
    if getattr(order, "addresses_json", None):
        try:
            parsed = json.loads(order.addresses_json)
            if isinstance(parsed, dict):
                root = parsed
        except (json.JSONDecodeError, TypeError):
            root = {}

    ship = _block(root, "shipping") or _block(root, "delivery")
    bill = _block(root, "billing")
    cust = _block(root, "customer")

    email = _norm_email(
        _first_str(bill, "email", "mail", "Email")
        or _first_str(ship, "email", "mail")
        or _first_str(cust, "email", "mail")
    )
    phone_raw = (
        _first_str(bill, "phone", "mobile", "tel", "Telefon")
        or _first_str(ship, "phone", "mobile", "tel")
        or _first_str(cust, "phone", "mobile", "tel")
    )
    phone = phone_raw.strip() or None

    company = (
        _first_str(bill, "company_name", "name", "firma")
        or _first_str(ship, "company_name", "company", "firma")
        or _first_str(cust, "company_name", "company")
    )
    nip = _digits_only(_first_str(bill, "nip", "NIP", "tax_id") or _first_str(cust, "nip", "NIP"))
    nip = nip if len(nip) >= 10 else None

    person = _first_str(ship, "name") or _first_str(cust, "name") or _first_str(bill, "name")
    first_name, last_name = _split_person_name(person)

    street_src = _first_str(bill, "street", "street_name", "Ulica") or _first_str(ship, "street", "Ulica")
    house_src = _first_str(bill, "house_number", "NrNieruchomosci") or _first_str(ship, "house_number")
    postal = _first_str(bill, "postal_code", "postcode", "zip", "Kod pocztowy") or _first_str(
        ship, "postal_code", "postcode", "zip"
    )
    city = _first_str(bill, "city", "Miejscowosc") or _first_str(ship, "city", "Miejscowosc")
    country = (_first_str(bill, "country", "Kraj") or _first_str(ship, "country", "Kraj") or "PL").upper()[:8]

    street, house_number, apartment_number = _parse_street_parts(street_src, house_src)

    doc_type = "INVOICE" if nip or company else "RECEIPT"
    addresses: list[dict[str, Any]] = []
    if street or city or postal:
        addresses.append(
            {
                "first_name": first_name or company or "Klient",
                "last_name": last_name or "—",
                "company_name": company or None,
                "street": street or "—",
                "house_number": house_number,
                "apartment_number": apartment_number,
                "postal_code": postal or "00-000",
                "city": city or "—",
                "country_code": country or "PL",
                "is_default": True,
            }
        )

    return {
        "first_name": first_name or company or "Klient",
        "last_name": last_name or ("—" if company else ""),
        "phone": phone,
        "email": email,
        "company_name": company or None,
        "nip": nip,
        "country_code": country or "PL",
        "default_document_type": doc_type,
        "addresses": addresses,
    }


def _customer_display(c: Customer) -> str:
    comp = (c.company_name or "").strip()
    if comp:
        return comp
    full = f"{(c.first_name or '').strip()} {(c.last_name or '').strip()}".strip()
    if full:
        return full
    if c.email:
        return str(c.email).strip()
    return f"Klient #{c.id}"


def find_duplicate_candidates(
    db: Session,
    *,
    tenant_id: int,
    email: str | None,
    phone: str | None,
    nip: str | None,
    company_name: str | None,
) -> list[dict[str, Any]]:
    q = db.query(Customer).filter(
        Customer.tenant_id == int(tenant_id),
        Customer.deleted_at.is_(None),
    )
    clauses = []
    em = _norm_email(email)
    if em:
        clauses.append(Customer.email.ilike(em))
    ph = _digits_only(phone)
    if len(ph) >= 9:
        clauses.append(Customer.phone.ilike(f"%{ph[-9:]}%"))
    np = _digits_only(nip)
    if len(np) >= 10:
        clauses.append(Customer.nip.ilike(f"%{np[-10:]}%"))
    comp = (company_name or "").strip()
    if len(comp) >= 3:
        clauses.append(Customer.company_name.ilike(f"%{comp[:64]}%"))

    if not clauses:
        return []

    rows = q.filter(or_(*clauses)).order_by(Customer.id.desc()).limit(8).all()
    out: list[dict[str, Any]] = []
    seen: set[int] = set()
    for row in rows:
        if int(row.id) in seen:
            continue
        seen.add(int(row.id))
        reasons: list[str] = []
        if em and _norm_email(row.email) == em:
            reasons.append("email")
        if ph and ph[-9:] in _digits_only(row.phone):
            reasons.append("telefon")
        if np and np[-10:] in _digits_only(row.nip):
            reasons.append("NIP")
        if comp and row.company_name and comp.lower() in row.company_name.lower():
            reasons.append("nazwa firmy")
        out.append(
            {
                "id": int(row.id),
                "display_name": _customer_display(row),
                "email": row.email,
                "phone": row.phone,
                "nip": row.nip,
                "match_reasons": reasons or ["podobieństwo"],
            }
        )
    return out


def _get_order(db: Session, *, order_id: int, tenant_id: int) -> Order:
    row = (
        db.query(Order)
        .filter(
            Order.id == int(order_id),
            Order.tenant_id == int(tenant_id),
            Order.deleted_at.is_(None),
        )
        .first()
    )
    if row is None:
        raise CustomerOrderLinkError("order_not_found", "Nie znaleziono zamówienia.")
    return row


def preview_order_customer_link(db: Session, *, order_id: int, tenant_id: int) -> dict[str, Any]:
    order = _get_order(db, order_id=order_id, tenant_id=tenant_id)
    draft = extract_order_customer_draft(order)
    duplicates = find_duplicate_candidates(
        db,
        tenant_id=tenant_id,
        email=draft.get("email"),
        phone=draft.get("phone"),
        nip=draft.get("nip"),
        company_name=draft.get("company_name"),
    )
    has_address = bool(draft.get("addresses"))
    has_data = any(
        [
            draft.get("email"),
            draft.get("phone"),
            draft.get("nip"),
            draft.get("company_name"),
            has_address,
        ]
    )
    return {
        "order_id": int(order.id),
        "customer_id": int(order.customer_id) if order.customer_id else None,
        "has_customer_data": bool(has_data),
        "draft": draft,
        "duplicates": duplicates,
    }


def create_customer_from_order(
    db: Session,
    *,
    order_id: int,
    tenant_id: int,
    force_duplicate: bool = False,
) -> dict[str, Any]:
    preview = preview_order_customer_link(db, order_id=order_id, tenant_id=tenant_id)
    order = _get_order(db, order_id=order_id, tenant_id=tenant_id)
    if order.customer_id:
        raise CustomerOrderLinkError("already_linked", "Zamówienie ma już przypisanego klienta.")
    if not preview["has_customer_data"]:
        raise CustomerOrderLinkError("no_data", "Zamówienie nie zawiera danych do utworzenia klienta.")

    duplicates = preview["duplicates"]
    if duplicates and not force_duplicate:
        raise CustomerOrderLinkError(
            "duplicate_detected",
            "Wykryto możliwe duplikaty klienta — użyj połączenia lub potwierdź utworzenie.",
        )

    draft = preview["draft"]
    row = Customer(
        tenant_id=int(tenant_id),
        first_name=str(draft.get("first_name") or "Klient").strip(),
        last_name=str(draft.get("last_name") or "").strip(),
        phone=draft.get("phone"),
        email=draft.get("email"),
        company_name=draft.get("company_name"),
        nip=draft.get("nip"),
        country_code=str(draft.get("country_code") or "PL"),
        default_document_type=str(draft.get("default_document_type") or "RECEIPT"),
        global_discount_percent=0.0,
    )
    db.add(row)
    db.flush()

    for addr in draft.get("addresses") or []:
        if not isinstance(addr, dict):
            continue
        a = CustomerAddressCreate(**addr)
        db.add(
            CustomerAddress(
                customer_id=int(row.id),
                first_name=a.first_name,
                last_name=a.last_name,
                company_name=a.company_name,
                street=a.street,
                house_number=a.house_number,
                apartment_number=a.apartment_number,
                postal_code=a.postal_code,
                city=a.city,
                country_code=a.country_code,
                is_default=bool(a.is_default),
            )
        )

    order.customer_id = int(row.id)
    db.flush()
    return {
        "customer_id": int(row.id),
        "display_name": _customer_display(row),
        "order_id": int(order.id),
        "duplicates_skipped": len(duplicates),
    }


def link_order_to_customer(
    db: Session,
    *,
    order_id: int,
    customer_id: int,
    tenant_id: int,
) -> dict[str, Any]:
    order = _get_order(db, order_id=order_id, tenant_id=tenant_id)
    if order.customer_id:
        raise CustomerOrderLinkError("already_linked", "Zamówienie ma już przypisanego klienta.")
    cust = (
        db.query(Customer)
        .filter(
            Customer.id == int(customer_id),
            Customer.tenant_id == int(tenant_id),
            Customer.deleted_at.is_(None),
        )
        .first()
    )
    if cust is None:
        raise CustomerOrderLinkError("customer_not_found", "Nie znaleziono klienta.")
    order.customer_id = int(cust.id)
    db.flush()
    return {
        "customer_id": int(cust.id),
        "display_name": _customer_display(cust),
        "order_id": int(order.id),
    }
