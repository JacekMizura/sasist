"""Direct-sale fulfillment + shipping snapshot — stored on session.metadata_json (SSOT reuse)."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.commerce_operational import DirectSaleSession
from ...models.customer import Customer, CustomerAddress
from ...models.shipping_method import ShippingMethod
from .errors import DirectSaleError

FULFILLMENT_PICKUP = "PICKUP"
FULFILLMENT_DELIVERY = "DELIVERY"
PAYMENT_TERMS_IMMEDIATE = "IMMEDIATE"
PAYMENT_TERMS_DEFERRED = "DEFERRED"


def _session_meta(sess: DirectSaleSession) -> dict[str, Any]:
    raw = getattr(sess, "metadata_json", None) or ""
    if not str(raw).strip():
        return {}
    try:
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, TypeError):
        return {}


def _write_session_meta(sess: DirectSaleSession, meta: dict[str, Any]) -> None:
    sess.metadata_json = json.dumps(meta, ensure_ascii=False) if meta else None


def default_fulfillment_payload() -> dict[str, Any]:
    return {
        "mode": FULFILLMENT_PICKUP,
        "shipping_address": None,
        "customer_address_id": None,
        "shipping_method_id": None,
        "pickup_point_code": None,
        "pickup_point_label": None,
        "payment_terms_mode": PAYMENT_TERMS_IMMEDIATE,
        "payment_terms_days": None,
    }


def get_session_fulfillment(sess: DirectSaleSession) -> dict[str, Any]:
    meta = _session_meta(sess)
    raw = meta.get("fulfillment")
    base = default_fulfillment_payload()
    if isinstance(raw, dict):
        base.update({k: raw.get(k, base.get(k)) for k in base})
        # Preserve extra keys (forward-compatible)
        for k, v in raw.items():
            if k not in base:
                base[k] = v
    return base


def _normalize_address(addr: dict[str, Any] | None) -> dict[str, Any] | None:
    if not addr or not isinstance(addr, dict):
        return None
    out = {
        "first_name": str(addr.get("first_name") or "").strip(),
        "last_name": str(addr.get("last_name") or "").strip(),
        "company_name": str(addr.get("company_name") or "").strip() or None,
        "street": str(addr.get("street") or "").strip(),
        "house_number": str(addr.get("house_number") or "").strip(),
        "apartment_number": str(addr.get("apartment_number") or "").strip() or None,
        "postal_code": str(addr.get("postal_code") or "").strip(),
        "city": str(addr.get("city") or "").strip(),
        "country_code": str(addr.get("country_code") or "PL").strip().upper() or "PL",
        "phone": str(addr.get("phone") or "").strip() or None,
        "email": str(addr.get("email") or "").strip() or None,
    }
    return out


def address_from_customer_address(row: CustomerAddress, *, phone: str | None, email: str | None) -> dict[str, Any]:
    return {
        "first_name": str(row.first_name or "").strip(),
        "last_name": str(row.last_name or "").strip(),
        "company_name": str(row.company_name or "").strip() or None,
        "street": str(row.street or "").strip(),
        "house_number": str(row.house_number or "").strip(),
        "apartment_number": str(row.apartment_number or "").strip() or None,
        "postal_code": str(row.postal_code or "").strip(),
        "city": str(row.city or "").strip(),
        "country_code": str(row.country_code or "PL").strip().upper() or "PL",
        "phone": (phone or None),
        "email": (email or None),
    }


def set_session_fulfillment(
    db: Session,
    sess: DirectSaleSession,
    *,
    mode: str | None = None,
    shipping_address: dict[str, Any] | None = None,
    customer_address_id: int | None = None,
    clear_customer_address: bool = False,
    shipping_method_id: str | None = None,
    clear_shipping_method: bool = False,
    pickup_point_code: str | None = None,
    pickup_point_label: str | None = None,
    payment_terms_mode: str | None = None,
    payment_terms_days: int | None = None,
) -> dict[str, Any]:
    if sess.status not in ("ACTIVE", "SUSPENDED", "CHECKOUT"):
        raise DirectSaleError("Sesja zamknięta.", code="session_closed")

    current = get_session_fulfillment(sess)
    m = str(mode or current.get("mode") or FULFILLMENT_PICKUP).strip().upper()
    if m not in (FULFILLMENT_PICKUP, FULFILLMENT_DELIVERY):
        raise DirectSaleError("Nieprawidłowy sposób realizacji.", code="invalid_fulfillment_mode")

    if clear_customer_address:
        current["customer_address_id"] = None
    elif customer_address_id is not None:
        addr_id = int(customer_address_id)
        row = (
            db.query(CustomerAddress)
            .filter(CustomerAddress.id == addr_id)
            .first()
        )
        if row is None:
            raise DirectSaleError("Adres klienta nie istnieje.", code="address_not_found", http_status=404)
        cust_id = int(sess.customer_id) if getattr(sess, "customer_id", None) else None
        if cust_id is None or int(row.customer_id) != cust_id:
            raise DirectSaleError(
                "Adres nie należy do klienta sesji.",
                code="address_customer_mismatch",
                http_status=400,
            )
        cust = db.query(Customer).filter(Customer.id == cust_id).first()
        current["customer_address_id"] = addr_id
        current["shipping_address"] = address_from_customer_address(
            row,
            phone=str(getattr(cust, "phone", None) or "") or None if cust else None,
            email=str(getattr(cust, "email", None) or "") or None if cust else None,
        )

    if shipping_address is not None:
        current["shipping_address"] = _normalize_address(shipping_address)
        # Manual address overrides selected saved id unless caller also set it
        if customer_address_id is None and not clear_customer_address:
            current["customer_address_id"] = current.get("customer_address_id")

    if clear_shipping_method:
        current["shipping_method_id"] = None
    elif shipping_method_id is not None:
        sm_id = str(shipping_method_id).strip()
        if not sm_id:
            current["shipping_method_id"] = None
        else:
            sm = (
                db.query(ShippingMethod)
                .filter(
                    ShippingMethod.id == sm_id,
                    ShippingMethod.tenant_id == int(sess.tenant_id),
                    ShippingMethod.warehouse_id == int(sess.warehouse_id),
                )
                .first()
            )
            if sm is None:
                raise DirectSaleError("Metoda wysyłki nie istnieje.", code="shipping_method_not_found", http_status=404)
            current["shipping_method_id"] = sm_id

    if pickup_point_code is not None:
        current["pickup_point_code"] = str(pickup_point_code).strip() or None
    if pickup_point_label is not None:
        current["pickup_point_label"] = str(pickup_point_label).strip() or None

    if payment_terms_mode is not None:
        ptm = str(payment_terms_mode).strip().upper()
        if ptm not in (PAYMENT_TERMS_IMMEDIATE, PAYMENT_TERMS_DEFERRED):
            raise DirectSaleError("Nieprawidłowy tryb terminu płatności.", code="invalid_payment_terms")
        current["payment_terms_mode"] = ptm
        if ptm == PAYMENT_TERMS_IMMEDIATE:
            current["payment_terms_days"] = None
        elif payment_terms_days is not None:
            current["payment_terms_days"] = max(0, int(payment_terms_days))
        elif current.get("payment_terms_days") is None and getattr(sess, "customer_id", None):
            cust = db.query(Customer).filter(Customer.id == int(sess.customer_id)).first()
            if cust is not None and getattr(cust, "payment_terms_days", None) is not None:
                current["payment_terms_days"] = max(0, int(cust.payment_terms_days))

    if payment_terms_days is not None and current.get("payment_terms_mode") == PAYMENT_TERMS_DEFERRED:
        current["payment_terms_days"] = max(0, int(payment_terms_days))

    current["mode"] = m
    if m == FULFILLMENT_PICKUP:
        # Keep shipping fields but they are inactive for pickup UI
        pass

    meta = _session_meta(sess)
    meta["fulfillment"] = current
    _write_session_meta(sess, meta)
    sess.last_activity_at = __import__("datetime").datetime.utcnow()
    return current


def validate_fulfillment_for_complete(sess: DirectSaleSession) -> dict[str, Any]:
    f = get_session_fulfillment(sess)
    if f.get("mode") != FULFILLMENT_DELIVERY:
        return f
    addr = f.get("shipping_address") if isinstance(f.get("shipping_address"), dict) else None
    if not addr:
        raise DirectSaleError(
            "Wysyłka wymaga danych dostawy.",
            code="shipping_address_required",
            http_status=400,
        )
    street = str(addr.get("street") or "").strip()
    city = str(addr.get("city") or "").strip()
    postal = str(addr.get("postal_code") or "").strip()
    name = f"{addr.get('first_name') or ''} {addr.get('last_name') or ''}".strip() or str(addr.get("company_name") or "").strip()
    if not name or not street or not city or not postal:
        raise DirectSaleError(
            "Uzupełnij odbiorcę, ulicę, kod pocztowy i miejscowość.",
            code="shipping_address_incomplete",
            http_status=400,
        )
    if not str(f.get("shipping_method_id") or "").strip():
        raise DirectSaleError(
            "Wybierz przewoźnika / metodę wysyłki.",
            code="shipping_method_required",
            http_status=400,
        )
    return f


def apply_fulfillment_to_order(db: Session, sess: DirectSaleSession, order) -> dict[str, Any]:
    """Map session fulfillment onto Order SSOT fields (addresses_json, shipping_method_id, fulfillment_mode)."""
    f = get_session_fulfillment(sess)
    mode = str(f.get("mode") or FULFILLMENT_PICKUP).upper()
    if mode == FULFILLMENT_DELIVERY:
        order.fulfillment_mode = "DELIVERY"
        sm_id = str(f.get("shipping_method_id") or "").strip() or None
        if sm_id:
            order.shipping_method_id = sm_id
            sm = (
                db.query(ShippingMethod)
                .filter(ShippingMethod.id == sm_id)
                .first()
            )
            if sm is not None:
                order.shipping_method = str(sm.name or "")
        addr = f.get("shipping_address") if isinstance(f.get("shipping_address"), dict) else {}
        shipping_block = {
            "first_name": addr.get("first_name") or "",
            "last_name": addr.get("last_name") or "",
            "company_name": addr.get("company_name"),
            "street": addr.get("street") or "",
            "house_number": addr.get("house_number") or "",
            "apartment_number": addr.get("apartment_number"),
            "postal_code": addr.get("postal_code") or "",
            "city": addr.get("city") or "",
            "country_code": addr.get("country_code") or "PL",
            "phone": addr.get("phone"),
            "email": addr.get("email"),
            "customer_address_id": f.get("customer_address_id"),
            "pickup_point_code": f.get("pickup_point_code"),
            "pickup_point_label": f.get("pickup_point_label"),
        }
        order.addresses_json = json.dumps({"shipping": shipping_block}, ensure_ascii=False)
    else:
        order.fulfillment_mode = "IMMEDIATE"
    return f


def transfer_should_settle(fulfillment: dict[str, Any] | None, payment_method: str) -> bool:
    """Deferred bank transfer stays PENDING; immediate settles like cash/card."""
    m = str(payment_method or "").strip().upper()
    if m != "TRANSFER":
        return True
    f = fulfillment or {}
    return str(f.get("payment_terms_mode") or PAYMENT_TERMS_IMMEDIATE).upper() != PAYMENT_TERMS_DEFERRED
