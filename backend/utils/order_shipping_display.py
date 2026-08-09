"""Resolve shipping method display name and logo from Order FK or legacy string."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Tuple

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models.order import Order


def _strip_logo(raw: object) -> Optional[str]:
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def order_shipping_display(order: "Order") -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Returns (display_name, logo_url, shipping_method_id).
    Prefers ``shipping_method_row``; falls back to legacy ``shipping_method`` string.
    """
    rel = getattr(order, "shipping_method_row", None)
    if rel is not None:
        name = (rel.name or "").strip() or None
        logo = _strip_logo(getattr(rel, "logo_url", None))
        sid = getattr(rel, "id", None)
        return name, logo, str(sid) if sid else None
    raw = getattr(order, "shipping_method", None)
    name = (str(raw).strip() if raw is not None else None) or None
    return name, None, None


def resolve_order_shipping_display(
    order: "Order",
    db: Optional["Session"] = None,
    *,
    tenant_id: int | None = None,
    warehouse_id: int | None = None,
) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Like ``order_shipping_display``, but when logo is missing and ``db`` is set,
    looks up ``ShippingMethod.logo_url`` for the order's warehouse (by id, name, code, alias).

    Packing / WMS cards need this so logos configured in Settings → Metody dostawy
    show even when the order only stores a legacy name string or a method row without logo.
    """
    name, logo, sid = order_shipping_display(order)
    if logo or db is None:
        return name, logo, sid

    tid = int(tenant_id if tenant_id is not None else (getattr(order, "tenant_id", 0) or 0))
    wid = int(warehouse_id if warehouse_id is not None else (getattr(order, "warehouse_id", 0) or 0))
    if tid < 1 or wid < 1:
        return name, logo, sid

    from ..models.shipping_method import ShippingMethod
    from ..services.shipping_method_service import normalize_import_label, parse_aliases_json

    mid = sid
    if not mid:
        raw_id = getattr(order, "shipping_method_id", None)
        mid = str(raw_id).strip() if raw_id else None

    if mid:
        row = db.query(ShippingMethod).filter(ShippingMethod.id == str(mid)).first()
        if row is not None:
            logo2 = _strip_logo(getattr(row, "logo_url", None))
            n2 = (getattr(row, "name", None) or "").strip() or name
            if logo2:
                return n2, logo2, str(row.id)
            if not name:
                name = n2

    hint = (name or getattr(order, "shipping_method", None) or "").strip()
    if not hint:
        return name, logo, sid

    rows = (
        db.query(ShippingMethod)
        .filter(
            ShippingMethod.tenant_id == tid,
            ShippingMethod.warehouse_id == wid,
        )
        .all()
    )
    if not rows:
        return name, logo, sid

    hint_l = hint.lower()
    hint_code = "".join(ch if ch.isalnum() or ch == "_" else "_" for ch in hint.upper())
    hint_code = "_".join(p for p in hint_code.split("_") if p)

    for row in rows:
        rn = (getattr(row, "name", None) or "").strip()
        if rn.lower() == hint_l:
            logo2 = _strip_logo(getattr(row, "logo_url", None))
            if logo2:
                return rn or name, logo2, str(row.id)

    for row in rows:
        cc = (getattr(row, "code", None) or "").strip().upper()
        if cc and (cc == hint.upper() or cc == hint_code):
            logo2 = _strip_logo(getattr(row, "logo_url", None))
            if logo2:
                rn = (getattr(row, "name", None) or "").strip() or name
                return rn, logo2, str(row.id)

    norm = normalize_import_label(hint)
    best = None
    best_score = -1
    for row in rows:
        phrases = list(parse_aliases_json(getattr(row, "aliases_json", None)))
        cc = (getattr(row, "code", None) or "").strip().lower()
        if cc:
            phrases.append(cc)
        rn = (getattr(row, "name", None) or "").strip().lower()
        if rn:
            phrases.append(rn)
        seen: set[str] = set()
        for ph in phrases:
            if not ph or ph in seen:
                continue
            seen.add(ph)
            if ph in norm and len(ph) > best_score:
                best_score = len(ph)
                best = row

    if best is not None:
        logo2 = _strip_logo(getattr(best, "logo_url", None))
        if logo2:
            rn = (getattr(best, "name", None) or "").strip() or name
            return rn, logo2, str(best.id)

    return name, logo, sid
