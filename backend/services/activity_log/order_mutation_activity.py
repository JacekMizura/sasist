"""OMS manual mutation Activity Log writers — addresses, notes, order lines.

Domain tables remain SSOT; these are concise timeline summaries only.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from .domain_activity import find_activity_by_correlation, record_domain_activity
from .order_event_codes import (
    ORDER_BILLING_ADDRESS_CHANGED,
    ORDER_BUNDLE_ADDED,
    ORDER_CUSTOMER_DATA_CHANGED,
    ORDER_DOCUMENT_SERIES_CHANGED,
    ORDER_EVENT_CATEGORY,
    ORDER_ITEM_ADDED,
    ORDER_ITEM_DISCOUNT_CHANGED,
    ORDER_ITEM_PRICE_CHANGED,
    ORDER_ITEM_QUANTITY_CHANGED,
    ORDER_ITEM_REMOVED,
    ORDER_ITEM_VAT_CHANGED,
    ORDER_NOTE_ADDED,
    ORDER_NOTE_DELETED,
    ORDER_NOTE_UPDATED,
    ORDER_PRIORITY_CHANGED,
    ORDER_SHIPPING_ADDRESS_CHANGED,
    ORDER_WAREHOUSE_CHANGED,
    ActorKind,
)

logger = logging.getLogger(__name__)

_SHIPPING_FIELD_LABELS: dict[str, str] = {
    "name": "Nazwa / imię i nazwisko",
    "company": "Firma",
    "street": "Ulica",
    "home_number": "Nr domu",
    "apartment_number": "Nr lokalu",
    "postcode": "Kod pocztowy",
    "city": "Miasto",
    "country": "Kraj",
    "phone": "Telefon",
    "email": "E-mail",
}

_BILLING_FIELD_LABELS: dict[str, str] = {
    "name": "Imię",
    "surname": "Nazwisko",
    "company": "Firma",
    "street": "Ulica",
    "home_number": "Nr domu",
    "apartment_number": "Nr lokalu",
    "postcode": "Kod pocztowy",
    "city": "Miasto",
    "country": "Kraj",
    "phone": "Telefon",
    "email": "E-mail",
    "nip": "NIP",
}


def _hash_key(*parts: Any) -> str:
    raw = "|".join("" if p is None else str(p) for p in parts)
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def _actor_meta(actor_kind: ActorKind) -> dict[str, Any]:
    meta: dict[str, Any] = {"actor_kind": actor_kind}
    if actor_kind == "AUTOMATION":
        meta["actor_label"] = "Automatyzacja"
    elif actor_kind == "SYSTEM":
        meta["actor_label"] = "System"
    elif actor_kind == "INTEGRATION":
        meta["actor_label"] = "Integracja"
    return meta


def _kind(actor_user_id: Optional[int], actor_kind: Optional[ActorKind] = None) -> ActorKind:
    if actor_kind is not None:
        return actor_kind
    return "USER" if actor_user_id else "SYSTEM"


def _pick(block: dict[str, Any], *keys: str) -> str:
    for k in keys:
        v = block.get(k)
        if v is None:
            continue
        s = str(v).strip()
        if s:
            return s
    return ""


def snapshot_shipping_address(block: Optional[dict[str, Any]]) -> dict[str, str]:
    b = block if isinstance(block, dict) else {}
    return {
        "name": _pick(b, "name", "Nazwa", "shipping_name"),
        "company": _pick(b, "company", "company_name", "Firma"),
        "street": _pick(b, "street", "Ulica"),
        "home_number": _pick(b, "home_number", "house_number", "Nr domu"),
        "apartment_number": _pick(b, "apartment_number", "flat_number", "Nr lokalu"),
        "postcode": _pick(b, "postcode", "postal_code", "Kod pocztowy"),
        "city": _pick(b, "city", "Miejscowość", "Miasto"),
        "country": _pick(b, "country", "Kraj"),
        "phone": _pick(b, "phone", "mobile", "tel", "Telefon"),
        "email": _pick(b, "email", "mail", "Email"),
    }


def snapshot_billing_address(block: Optional[dict[str, Any]]) -> dict[str, str]:
    b = block if isinstance(block, dict) else {}
    return {
        "name": _pick(b, "first_name", "Imię", "name"),
        "surname": _pick(b, "last_name", "Nazwisko", "surname"),
        "company": _pick(b, "company_name", "Firma", "company"),
        "street": _pick(b, "street", "Ulica", "billing_street"),
        "home_number": _pick(b, "home_number", "house_number", "Nr domu"),
        "apartment_number": _pick(b, "apartment_number", "flat_number", "Nr lokalu"),
        "postcode": _pick(b, "postal_code", "postcode", "Kod pocztowy"),
        "city": _pick(b, "city", "Miejscowość", "Miasto"),
        "country": _pick(b, "country", "Kraj"),
        "phone": _pick(b, "phone", "mobile", "tel", "Telefon"),
        "email": _pick(b, "email", "mail", "Email"),
        "nip": _pick(b, "nip", "NIP", "tax_id"),
    }


def diff_address_snapshots(
    old: dict[str, str],
    new: dict[str, str],
    *,
    labels: dict[str, str],
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for key, label in labels.items():
        o = str(old.get(key) or "").strip()
        n = str(new.get(key) or "").strip()
        if o == n:
            continue
        out.append({"key": key, "label": label, "old": o or "—", "new": n or "—"})
    return out


def format_money_pl(value: Any, *, currency: str = "PLN") -> str:
    try:
        v = float(value)
    except (TypeError, ValueError):
        return "—"
    body = f"{v:.2f}".replace(".", ",")
    cur = (currency or "PLN").strip().upper()
    if cur in ("PLN", "ZL", "ZŁ"):
        return f"{body} zł"
    return f"{body} {cur}"


def product_line_snapshot(
    *,
    product_name: Optional[str],
    product_id: Optional[int] = None,
    sku: Optional[str] = None,
    ean: Optional[str] = None,
    quantity: Any = None,
    unit_price: Any = None,
    currency: str = "PLN",
) -> dict[str, Any]:
    name = (str(product_name or "").strip() or (f"Produkt #{product_id}" if product_id else "Produkt"))[:512]
    snap: dict[str, Any] = {"product_name": name, "name": name}
    if product_id is not None:
        snap["product_id"] = int(product_id)
    if sku:
        snap["sku"] = str(sku)[:128]
    if ean:
        snap["ean"] = str(ean)[:64]
    if quantity is not None:
        snap["quantity"] = quantity
    if unit_price is not None:
        snap["unit_price"] = float(unit_price)
        snap["unit_price_display"] = format_money_pl(unit_price, currency=currency)
    snap["currency"] = (currency or "PLN")[:8]
    return snap


def emit_order_shipping_address_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_snapshot: dict[str, str],
    new_snapshot: dict[str, str],
    actor_user_id: Optional[int] = None,
    actor_kind: Optional[ActorKind] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    changed = diff_address_snapshots(old_snapshot, new_snapshot, labels=_SHIPPING_FIELD_LABELS)
    if not changed:
        return None
    cid = f"oaddr-ship:{int(order_id)}:{_hash_key(changed, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id, actor_kind)
    meta = {
        **_actor_meta(kind),
        "ref_type": "order",
        "ref_id": int(order_id),
        "address_kind": "shipping",
        "old": {c["key"]: c["old"] for c in changed},
        "new": {c["key"]: c["new"] for c in changed},
        "changed_fields": changed,
    }
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_SHIPPING_ADDRESS_CHANGED,
        description="Zmieniono adres dostawy.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_SHIPPING_ADDRESS_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_billing_address_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_snapshot: dict[str, str],
    new_snapshot: dict[str, str],
    actor_user_id: Optional[int] = None,
    actor_kind: Optional[ActorKind] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    changed = diff_address_snapshots(old_snapshot, new_snapshot, labels=_BILLING_FIELD_LABELS)
    if not changed:
        return None
    cid = f"oaddr-bill:{int(order_id)}:{_hash_key(changed, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id, actor_kind)
    meta = {
        **_actor_meta(kind),
        "ref_type": "order",
        "ref_id": int(order_id),
        "address_kind": "billing",
        "old": {c["key"]: c["old"] for c in changed},
        "new": {c["key"]: c["new"] for c in changed},
        "changed_fields": changed,
    }
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_BILLING_ADDRESS_CHANGED,
        description="Zmieniono adres faktury.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_BILLING_ADDRESS_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_customer_data_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_customer_id: Optional[int],
    new_customer_id: Optional[int],
    old_label: Optional[str] = None,
    new_label: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    if old_customer_id == new_customer_id:
        return None
    cid = f"ocust:{int(order_id)}:{_hash_key(old_customer_id, new_customer_id, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    o = str(old_label or "").strip() or (f"#{old_customer_id}" if old_customer_id else "—")
    n = str(new_label or "").strip() or (f"#{new_customer_id}" if new_customer_id else "—")
    meta = {
        **_actor_meta(kind),
        "ref_type": "order",
        "ref_id": int(order_id),
        "old_customer_id": old_customer_id,
        "new_customer_id": new_customer_id,
        "old_value": o[:255],
        "new_value": n[:255],
    }
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_CUSTOMER_DATA_CHANGED,
        description=f"Zmieniono klienta zamówienia z „{o}” na „{n}”.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_CUSTOMER_DATA_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_note_added_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    note_id: Optional[int] = None,
    note_type: str = "operational",
    content_preview: Optional[str] = None,
    show_in_picking: Optional[bool] = None,
    show_in_packing: Optional[bool] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    if note_id is not None:
        cid = f"onote-add:{int(note_id)}"[:64]
    else:
        cid = f"onote-add:{int(order_id)}:{_hash_key(note_type, content_preview, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    meta: dict[str, Any] = {
        **_actor_meta(kind),
        "ref_type": "order_note",
        "ref_id": int(note_id) if note_id is not None else int(order_id),
        "note_type": str(note_type or "")[:64],
    }
    if note_id is not None:
        meta["note_id"] = int(note_id)
    if content_preview:
        meta["content_preview"] = str(content_preview).strip()[:280]
    if show_in_picking is not None:
        meta["show_in_picking"] = bool(show_in_picking)
    if show_in_packing is not None:
        meta["show_in_packing"] = bool(show_in_packing)
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_NOTE_ADDED,
        description="Dodano notatkę do zamówienia.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_NOTE_ADDED],
        source_module="order_notes",
        occurred_at=occurred_at,
    )


def emit_order_note_updated_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    note_id: int,
    note_type: str = "operational",
    content_preview: Optional[str] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"onote-upd:{int(note_id)}:{_hash_key(content_preview, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    meta: dict[str, Any] = {
        **_actor_meta(kind),
        "ref_type": "order_note",
        "ref_id": int(note_id),
        "note_id": int(note_id),
        "note_type": str(note_type or "")[:64],
    }
    if content_preview:
        meta["content_preview"] = str(content_preview).strip()[:280]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_NOTE_UPDATED,
        description="Edytowano notatkę.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_NOTE_UPDATED],
        source_module="order_notes",
        occurred_at=occurred_at,
    )


def emit_order_note_deleted_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    note_id: int,
    note_type: str = "operational",
    actor_user_id: Optional[int] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"onote-del:{int(note_id)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_NOTE_DELETED,
        description="Usunięto notatkę.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata={
            **_actor_meta(kind),
            "ref_type": "order_note",
            "ref_id": int(note_id),
            "note_id": int(note_id),
            "note_type": str(note_type or "")[:64],
        },
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_NOTE_DELETED],
        source_module="order_notes",
        occurred_at=occurred_at,
    )


def emit_order_item_added_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_item_id: int,
    snapshot: dict[str, Any],
    actor_user_id: Optional[int] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"oitem-add:{int(order_item_id)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(snapshot.get("product_name") or snapshot.get("name") or "Produkt").strip()
    meta = {
        **_actor_meta(kind),
        "ref_type": "order_item",
        "ref_id": int(order_item_id),
        "order_item_id": int(order_item_id),
    }
    for k in ("product_id", "sku", "ean", "quantity", "unit_price", "currency", "product_name", "name"):
        if k in snapshot:
            meta[k] = snapshot[k]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_ITEM_ADDED,
        description=f"Dodano produkt „{name}” do zamówienia.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_ITEM_ADDED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def emit_order_item_removed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_item_id: int,
    snapshot: dict[str, Any],
    actor_user_id: Optional[int] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"oitem-rm:{int(order_item_id)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(snapshot.get("product_name") or snapshot.get("name") or "Produkt").strip()
    meta = {
        **_actor_meta(kind),
        "ref_type": "order_item",
        "ref_id": int(order_item_id),
        "order_item_id": int(order_item_id),
    }
    for k in ("product_id", "sku", "ean", "quantity", "unit_price", "currency", "product_name", "name"):
        if k in snapshot:
            meta[k] = snapshot[k]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_ITEM_REMOVED,
        description=f"Usunięto produkt „{name}” z zamówienia.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_ITEM_REMOVED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def emit_order_item_quantity_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_item_id: int,
    product_name: str,
    old_quantity: Any,
    new_quantity: Any,
    snapshot: Optional[dict[str, Any]] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    try:
        oq = int(round(float(old_quantity)))
        nq = int(round(float(new_quantity)))
    except (TypeError, ValueError):
        return None
    if oq == nq:
        return None
    cid = f"oitem-qty:{int(order_item_id)}:{_hash_key(oq, nq, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(product_name or "Produkt").strip()
    meta: dict[str, Any] = {
        **_actor_meta(kind),
        "ref_type": "order_item",
        "ref_id": int(order_item_id),
        "order_item_id": int(order_item_id),
        "product_name": name[:512],
        "old_quantity": oq,
        "new_quantity": nq,
        "old_value": str(oq),
        "new_value": str(nq),
    }
    if snapshot:
        for k in ("product_id", "sku", "ean", "currency"):
            if k in snapshot:
                meta[k] = snapshot[k]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_ITEM_QUANTITY_CHANGED,
        description=f"Zmieniono ilość produktu „{name}” z {oq} na {nq}.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_ITEM_QUANTITY_CHANGED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def emit_order_item_price_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_item_id: int,
    product_name: str,
    old_price: Any,
    new_price: Any,
    currency: str = "PLN",
    snapshot: Optional[dict[str, Any]] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    try:
        op = round(float(old_price), 4)
        np_ = round(float(new_price), 4)
    except (TypeError, ValueError):
        return None
    if abs(op - np_) < 1e-9:
        return None
    cid = f"oitem-price:{int(order_item_id)}:{_hash_key(op, np_, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(product_name or "Produkt").strip()
    old_d = format_money_pl(op, currency=currency)
    new_d = format_money_pl(np_, currency=currency)
    meta: dict[str, Any] = {
        **_actor_meta(kind),
        "ref_type": "order_item",
        "ref_id": int(order_item_id),
        "order_item_id": int(order_item_id),
        "product_name": name[:512],
        "old_unit_price": op,
        "new_unit_price": np_,
        "old_value": old_d,
        "new_value": new_d,
        "currency": (currency or "PLN")[:8],
    }
    if snapshot:
        for k in ("product_id", "sku", "ean"):
            if k in snapshot:
                meta[k] = snapshot[k]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_ITEM_PRICE_CHANGED,
        description=f"Zmieniono cenę produktu „{name}” z {old_d} na {new_d}.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_ITEM_PRICE_CHANGED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def emit_order_item_vat_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_item_id: int,
    product_name: str,
    old_vat: Any,
    new_vat: Any,
    snapshot: Optional[dict[str, Any]] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    try:
        ov = None if old_vat is None else round(float(old_vat), 4)
        nv = None if new_vat is None else round(float(new_vat), 4)
    except (TypeError, ValueError):
        return None
    if ov == nv:
        return None
    cid = f"oitem-vat:{int(order_item_id)}:{_hash_key(ov, nv, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(product_name or "Produkt").strip()
    o_s = "—" if ov is None else f"{ov:g}%"
    n_s = "—" if nv is None else f"{nv:g}%"
    meta: dict[str, Any] = {
        **_actor_meta(kind),
        "ref_type": "order_item",
        "ref_id": int(order_item_id),
        "order_item_id": int(order_item_id),
        "product_name": name[:512],
        "old_vat_percent": ov,
        "new_vat_percent": nv,
        "old_value": o_s,
        "new_value": n_s,
    }
    if snapshot:
        for k in ("product_id", "sku", "ean"):
            if k in snapshot:
                meta[k] = snapshot[k]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_ITEM_VAT_CHANGED,
        description=f"Zmieniono VAT produktu „{name}” z {o_s} na {n_s}.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_ITEM_VAT_CHANGED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def emit_order_item_discount_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    order_item_id: int,
    product_name: str,
    old_discount: Any,
    new_discount: Any,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    """Reserved — no OMS line-discount mutation path yet."""
    if str(old_discount) == str(new_discount):
        return None
    cid = f"oitem-disc:{int(order_item_id)}:{_hash_key(old_discount, new_discount, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(product_name or "Produkt").strip()
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_ITEM_DISCOUNT_CHANGED,
        description=f"Zmieniono rabat produktu „{name}” z {old_discount} na {new_discount}.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata={
            **_actor_meta(kind),
            "ref_type": "order_item",
            "ref_id": int(order_item_id),
            "order_item_id": int(order_item_id),
            "product_name": name[:512],
            "old_value": str(old_discount)[:128],
            "new_value": str(new_discount)[:128],
        },
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_ITEM_DISCOUNT_CHANGED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def emit_order_priority_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_priority: Optional[str],
    new_priority: Optional[str],
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    old_p = str(old_priority or "").strip().lower() or None
    new_p = str(new_priority or "").strip().lower() or None
    if old_p == new_p:
        return None
    cid = f"oprio:{int(order_id)}:{_hash_key(old_p, new_p, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    o = old_p or "—"
    n = new_p or "—"
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_PRIORITY_CHANGED,
        description=f"Zmieniono priorytet zamówienia z „{o}” na „{n}”.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata={
            **_actor_meta(kind),
            "ref_type": "order",
            "ref_id": int(order_id),
            "old_value": o[:64],
            "new_value": n[:64],
        },
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_PRIORITY_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_document_series_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_series_id: Optional[str],
    old_series_name: Optional[str],
    new_series_id: Optional[str],
    new_series_name: Optional[str],
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    old_id = str(old_series_id or "").strip() or None
    new_id = str(new_series_id or "").strip() or None
    if old_id == new_id:
        return None
    cid = f"oser:{int(order_id)}:{_hash_key(old_id, new_id, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    o = str(old_series_name or "").strip() or old_id or "—"
    n = str(new_series_name or "").strip() or new_id or "—"
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_DOCUMENT_SERIES_CHANGED,
        description=f"Zmieniono serię dokumentu z „{o}” na „{n}”.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata={
            **_actor_meta(kind),
            "ref_type": "order",
            "ref_id": int(order_id),
            "old_series_id": old_id,
            "new_series_id": new_id,
            "old_value": o[:255],
            "new_value": n[:255],
        },
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_DOCUMENT_SERIES_CHANGED],
        source_module="order_panel",
        occurred_at=occurred_at,
    )


def emit_order_warehouse_changed_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    old_warehouse_id: Optional[int],
    old_warehouse_name: Optional[str],
    new_warehouse_id: Optional[int],
    new_warehouse_name: Optional[str],
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    if old_warehouse_id == new_warehouse_id:
        return None
    cid = f"owh:{int(order_id)}:{_hash_key(old_warehouse_id, new_warehouse_id, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    o = str(old_warehouse_name or "").strip() or (f"#{old_warehouse_id}" if old_warehouse_id else "—")
    n = str(new_warehouse_name or "").strip() or (f"#{new_warehouse_id}" if new_warehouse_id else "—")
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_WAREHOUSE_CHANGED,
        description=f"Zmieniono magazyn z „{o}” na „{n}”.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata={
            **_actor_meta(kind),
            "ref_type": "order",
            "ref_id": int(order_id),
            "old_warehouse_id": old_warehouse_id,
            "new_warehouse_id": new_warehouse_id,
            "old_value": o[:255],
            "new_value": n[:255],
        },
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_WAREHOUSE_CHANGED],
        source_module="order_fulfillment",
        occurred_at=occurred_at,
    )


def emit_order_bundle_added_activity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    order_id: int,
    bundle_id: int,
    bundle_name: str,
    quantity: int,
    component_count: int,
    component_summaries: Optional[list[dict[str, Any]]] = None,
    actor_user_id: Optional[int] = None,
    mutation_token: Optional[str] = None,
    occurred_at: Optional[datetime] = None,
) -> Any:
    cid = f"obundle-add:{int(order_id)}:{int(bundle_id)}:{_hash_key(quantity, component_count, mutation_token)}"[:64]
    if find_activity_by_correlation(db, correlation_id=cid, tenant_id=int(tenant_id)):
        return None
    kind = _kind(actor_user_id)
    name = str(bundle_name or f"Zestaw #{bundle_id}").strip()
    meta: dict[str, Any] = {
        **_actor_meta(kind),
        "ref_type": "bundle",
        "ref_id": int(bundle_id),
        "bundle_id": int(bundle_id),
        "bundle_name": name[:255],
        "quantity": int(quantity),
        "component_count": int(component_count),
    }
    if component_summaries:
        meta["components"] = component_summaries[:40]
    return record_domain_activity(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=warehouse_id,
        event_type=ORDER_BUNDLE_ADDED,
        description=f"Dodano zestaw „{name}” do zamówienia.",
        actor_user_id=actor_user_id if kind == "USER" else None,
        order_id=int(order_id),
        metadata=meta,
        correlation_id=cid,
        severity="INFO",
        category=ORDER_EVENT_CATEGORY[ORDER_BUNDLE_ADDED],
        source_module="order_items",
        occurred_at=occurred_at,
    )


def build_mutation_detail_rows(metadata: dict[str, Any] | None) -> list[dict[str, str]]:
    meta = metadata or {}
    rows: list[dict[str, str]] = []
    changed = meta.get("changed_fields")
    if isinstance(changed, list):
        for item in changed:
            if not isinstance(item, dict):
                continue
            label = str(item.get("label") or item.get("key") or "").strip()
            if not label:
                continue
            rows.append(
                {
                    "label": label,
                    "value": f"{item.get('old') or '—'} → {item.get('new') or '—'}",
                }
            )
    preview = meta.get("content_preview")
    if preview and not any(r["label"] == "Treść" for r in rows):
        rows.append({"label": "Treść", "value": str(preview)})
    flags = []
    if meta.get("show_in_picking"):
        flags.append("WMS Zbieranie")
    if meta.get("show_in_packing"):
        flags.append("WMS Pakowanie")
    if flags:
        rows.append({"label": "Widoczność", "value": ", ".join(flags)})
    if not rows and meta.get("old_value") is not None and meta.get("new_value") is not None:
        rows.append({"label": "Zmiana", "value": f"{meta['old_value']} → {meta['new_value']}"})
    comps = meta.get("components")
    if isinstance(comps, list) and comps:
        for c in comps[:20]:
            if not isinstance(c, dict):
                continue
            nm = str(c.get("name") or c.get("product_name") or "").strip()
            if not nm:
                continue
            qty = c.get("quantity")
            rows.append({"label": "Składnik", "value": f"{nm}" + (f" × {qty}" if qty is not None else "")})
    return rows
