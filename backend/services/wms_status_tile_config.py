"""Wspólna logika kafelka statusu WMS: wymóg wózka + ikona BULK vs koszyki (z picking_config)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Optional, Tuple

from sqlalchemy.orm import Session

from .cart_display import cart_display_name_for_wms

if TYPE_CHECKING:
    from ..models.cart import Cart

CartTypeHint = Optional[Literal["BULK", "BASKETS"]]


def wms_tile_cart_config(single_mode: str | None, multi_mode: str | None) -> Tuple[bool, CartTypeHint]:
    """
    Zwraca ``(require_cart, cart_type)`` dla jednego wiersza ``picking_config``.

    - ``require_cart``: True gdy ``scanned`` lub ``baskets`` w single/multi.
    - ``cart_type``: ``BASKETS`` gdy którykolwiek tryb to koszyki; w przeciwnym razie przy
      ``require_cart`` tylko ze skanem — ``BULK``; przy braku wymogu — ``None``.
    """
    sm = (single_mode or "").strip().lower()
    mm = (multi_mode or "").strip().lower()

    def needs_cart(m: str) -> bool:
        return m in ("scanned", "baskets")

    # consolidation_rack / bulk / mobile — bez skanu wózka na kafelku statusu

    require = needs_cart(sm) or needs_cart(mm)
    if not require:
        return False, None
    if "baskets" in (sm, mm):
        return True, "BASKETS"
    return True, "BULK"


def merge_wms_tile_cart_configs(
    mode_pairs: list[Tuple[str | None, str | None]],
) -> Tuple[bool, CartTypeHint]:
    """Łączy wiele reguł (np. wiele źródeł na ten sam status docelowy pakowania)."""
    req = False
    has_baskets = False
    has_bulk = False
    for sm, mm in mode_pairs:
        r, ct = wms_tile_cart_config(sm, mm)
        if r:
            req = True
            if ct == "BASKETS":
                has_baskets = True
            elif ct == "BULK":
                has_bulk = True
    if not req:
        return False, None
    if has_baskets:
        return True, "BASKETS"
    return True, "BULK"


def resolve_operator_active_picking_cart(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None,
) -> "Cart | None":
    """
    Wózek aktualnie przypisany do operatora w cyklu zbierania (ASSIGNED / PICKING).

    Ten sam SSOT co skan / start zbierania — ``Cart.assigned_user_id`` + status cyklu.
    """
    if operator_user_id is None or int(operator_user_id) <= 0:
        return None
    from ..models.cart import Cart
    from ..models.enums import CartStatus

    active = (CartStatus.PICKING.value, CartStatus.ASSIGNED.value)
    return (
        db.query(Cart)
        .filter(
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
            Cart.assigned_user_id == int(operator_user_id),
            Cart.status.in_(active),
        )
        .order_by(Cart.id.desc())
        .first()
    )


def active_cart_tile_fields(cart: "Cart | None") -> dict[str, Any]:
    """Pola kafelka statusu — puste gdy brak przypisanego wózka."""
    if cart is None:
        return {"active_cart_code": None, "active_cart_name": None}
    code = (getattr(cart, "code", None) or getattr(cart, "barcode", None) or "").strip() or None
    name = (cart_display_name_for_wms(cart) or "").strip() or None
    return {"active_cart_code": code, "active_cart_name": name}
