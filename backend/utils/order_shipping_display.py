"""Resolve shipping method display name and logo from Order FK or legacy string."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Tuple

if TYPE_CHECKING:
    from ..models.order import Order


def order_shipping_display(order: "Order") -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """
    Returns (display_name, logo_url, shipping_method_id).
    Prefers ``shipping_method_row``; falls back to legacy ``shipping_method`` string.
    """
    rel = getattr(order, "shipping_method_row", None)
    if rel is not None:
        name = (rel.name or "").strip() or None
        logo_raw = getattr(rel, "logo_url", None)
        logo = (str(logo_raw).strip() or None) if logo_raw is not None and str(logo_raw).strip() else None
        sid = getattr(rel, "id", None)
        return name, logo, str(sid) if sid else None
    raw = getattr(order, "shipping_method", None)
    name = (str(raw).strip() if raw is not None else None) or None
    return name, None, None
