"""Wspólna logika kafelka statusu WMS: wymóg wózka + ikona BULK vs koszyki (z picking_config)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any, Literal, Optional, Tuple

from sqlalchemy.orm import Session

from .cart_display import cart_display_name_for_wms

if TYPE_CHECKING:
    from ..models.cart import Cart

CartTypeHint = Optional[Literal["BULK", "BASKETS"]]
CartPhysicalFamily = Literal["bulk", "baskets"]

CART_TYPE_MISMATCH_MSG = "Ten wózek nie jest przeznaczony do tego trybu zbierania."


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
    sm_baskets = sm == "baskets"
    mm_baskets = mm == "baskets"
    sm_bulk = sm == "scanned"
    mm_bulk = mm == "scanned"
    # Tylko koszyki → BASKETS. Tylko skan wózka → BULK.
    # Mieszanka na jednym statusie: NIE wymuszaj BASKETS (to psuło skan CART-0001).
    if (sm_baskets or mm_baskets) and not (sm_bulk or mm_bulk):
        return True, "BASKETS"
    if (sm_bulk or mm_bulk) and not (sm_baskets or mm_baskets):
        return True, "BULK"
    if sm_baskets and mm_baskets:
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


def cart_physical_family(cart: "Cart | None") -> CartPhysicalFamily | None:
    """Mapuje ``Cart.type`` na rodzinę trybu zbierania: bulk ↔ BULK, baskets ↔ MULTI."""
    if cart is None:
        return None
    raw = getattr(cart, "type", None)
    if raw is None:
        return None
    ctype = str(getattr(raw, "value", raw) or "").split(".")[-1].upper()
    if ctype == "BULK":
        return "bulk"
    if ctype == "MULTI":
        return "baskets"
    return None


def tile_type_to_family(tile_type: CartTypeHint | str | None) -> CartPhysicalFamily | None:
    t = (str(tile_type or "").strip().upper() or None)
    if t == "BASKETS":
        return "baskets"
    if t == "BULK":
        return "bulk"
    return None


def cart_matches_tile_type(cart: "Cart | None", tile_type: CartTypeHint | str | None) -> bool:
    """Czy fizyczny typ wózka pasuje do hintu kafelka (BULK/BASKETS)."""
    need = tile_type_to_family(tile_type)
    if need is None:
        return True
    fam = cart_physical_family(cart)
    return fam == need


def assert_cart_matches_tile_type(cart: "Cart", tile_type: CartTypeHint | str | None) -> None:
    """Odrzuca skan niewłaściwego typu wózka dla trybu statusu."""
    if not cart_matches_tile_type(cart, tile_type):
        raise ValueError(CART_TYPE_MISMATCH_MSG)


def resolve_operator_active_picking_cart(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_user_id: int | None,
    cart_type_hint: CartTypeHint | str | None = None,
) -> "Cart | None":
    """
    Wózek aktualnie przypisany do operatora w cyklu zbierania (ASSIGNED / PICKING).

    Ten sam SSOT co skan / start zbierania — ``Cart.assigned_user_id`` + status cyklu.
    Opcjonalnie filtruje po typie (BULK vs MULTI) zgodnym z kafelkiem statusu.
    """
    if operator_user_id is None or int(operator_user_id) <= 0:
        return None
    from ..models.cart import Cart
    from ..models.enums import CartStatus, CartType

    active = (CartStatus.PICKING.value, CartStatus.ASSIGNED.value)
    q = db.query(Cart).filter(
        Cart.tenant_id == int(tenant_id),
        Cart.warehouse_id == int(warehouse_id),
        Cart.assigned_user_id == int(operator_user_id),
        Cart.status.in_(active),
    )
    fam = tile_type_to_family(cart_type_hint)
    if fam == "bulk":
        q = q.filter(Cart.type == CartType.BULK)
    elif fam == "baskets":
        q = q.filter(Cart.type == CartType.MULTI)
    return q.order_by(Cart.id.desc()).first()


def active_cart_tile_fields(cart: "Cart | None") -> dict[str, Any]:
    """Pola kafelka statusu — puste gdy brak przypisanego wózka."""
    if cart is None:
        return {
            "active_cart_id": None,
            "active_cart_code": None,
            "active_cart_name": None,
            "active_cart_type": None,
        }
    code = (getattr(cart, "code", None) or getattr(cart, "barcode", None) or "").strip() or None
    name = (cart_display_name_for_wms(cart) or "").strip() or None
    fam = cart_physical_family(cart)
    tile_ct = "BASKETS" if fam == "baskets" else ("BULK" if fam == "bulk" else None)
    return {
        "active_cart_id": int(cart.id),
        "active_cart_code": code,
        "active_cart_name": name,
        "active_cart_type": tile_ct,
    }
