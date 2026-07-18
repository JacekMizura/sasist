"""Resolve CapacityStrategy + limits from Cart (structure + strategy fields)."""

from __future__ import annotations

from typing import Any

from ...models.cart import Cart
from ...models.enums import CartType
from .enums import LEGACY_CAPACITY_MODE_TO_STRATEGY, CapacityStrategy
from .types import BasketWorking


def _cart_type(cart: Cart) -> str:
    raw = cart.type.value if hasattr(cart.type, "value") else str(cart.type)
    return str(raw).split(".")[-1].upper()


def normalize_capacity_strategy(raw: Any, *, cart_type: str | None = None) -> CapacityStrategy:
    """Map DB/API string to CapacityStrategy. MULTI always → BASKETS."""
    if cart_type and cart_type.upper() == "MULTI":
        return CapacityStrategy.BASKETS
    if isinstance(raw, CapacityStrategy):
        if cart_type and cart_type.upper() == "MULTI":
            return CapacityStrategy.BASKETS
        return raw
    if raw is None:
        return CapacityStrategy.LIMIT_VOLUME
    s = str(raw).strip()
    if not s:
        return CapacityStrategy.LIMIT_VOLUME
    up = s.upper().replace("-", "_").replace(" ", "_")
    for st in CapacityStrategy:
        if st.value == up or st.name == up:
            if cart_type and cart_type.upper() == "MULTI":
                return CapacityStrategy.BASKETS
            return st
    legacy = LEGACY_CAPACITY_MODE_TO_STRATEGY.get(s.lower())
    if legacy is not None:
        return legacy
    return CapacityStrategy.LIMIT_VOLUME


def resolve_capacity_strategy(cart: Cart) -> CapacityStrategy:
    return normalize_capacity_strategy(
        getattr(cart, "capacity_strategy", None),
        cart_type=_cart_type(cart),
    )


def resolve_capacity_orders(cart: Cart) -> int | None:
    raw = getattr(cart, "capacity_orders", None)
    if raw is None:
        return None
    try:
        n = int(raw)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def resolve_capacity_volume(cart: Cart) -> float | None:
    """Prefer explicit capacity_volume; else geometry total_volume (dm³)."""
    raw = getattr(cart, "capacity_volume", None)
    if raw is None:
        raw = getattr(cart, "total_volume", None)
    try:
        v = float(raw or 0)
    except (TypeError, ValueError):
        return None
    return v if v > 0 else None


def basket_usable_volume(basket: Any) -> float:
    uv = getattr(basket, "usable_volume", None)
    if uv is not None and float(uv) > 0:
        return float(uv)
    l_ = float(getattr(basket, "inner_length", None) or 0)
    w_ = float(getattr(basket, "inner_width", None) or 0)
    h_ = float(getattr(basket, "inner_height", None) or 0)
    if l_ > 0 and w_ > 0 and h_ > 0:
        return round((l_ * w_ * h_) / 1000.0, 4)
    return 0.0


def load_basket_workings(cart: Cart) -> list[BasketWorking]:
    out: list[BasketWorking] = []
    for b in getattr(cart, "baskets", None) or []:
        oid = getattr(b, "order_id", None)
        used = float(getattr(b, "used_volume", None) or 0)
        out.append(
            BasketWorking(
                basket_id=int(b.id),
                usable_volume=basket_usable_volume(b),
                order_id=int(oid) if oid is not None else None,
                used_volume=used if oid is not None else 0.0,
            )
        )
    return out


def is_multi_cart(cart: Cart) -> bool:
    return _cart_type(cart) == CartType.MULTI.value.upper() or _cart_type(cart) == "MULTI"
