"""
Namespaced internal scan codes (WMS) — no collision with product EAN/SKU.

Formats (ID = database primary key):
  BULK cart:     ESP:shpcart:{id}
  MULTI cart:    ESP:brck:{id}
  Cart basket:  ESP:bsh:{id}
  Bin/location:  ESP:sh:{id}
  Order:         ESP:O:{id}
"""

from __future__ import annotations

import re
from typing import Any, Literal, Optional

EspEntityKind = Literal["order", "cart_bulk", "cart_multi", "basket", "location"]

ESP_SCAN_RE = re.compile(
    r"^ESP:(?P<kind>shpcart|brck|bsh|sh|O):(?P<pid>\d+)$",
    re.IGNORECASE,
)


def cart_type_is_multi(cart_type) -> bool:
    """True if cart is MULTI (wózek z koszykami)."""
    if cart_type is None:
        return False
    if hasattr(cart_type, "name"):
        return str(getattr(cart_type, "name", "")).upper() == "MULTI"
    if hasattr(cart_type, "value"):
        return str(getattr(cart_type, "value", "")).lower() == "multi"
    s = str(cart_type).upper()
    return "MULTI" in s


def cart_scan_code_for_type(cart_type, cart_id: int) -> str:
    """Return canonical cart scan code from cart type + PK."""
    if cart_type_is_multi(cart_type):
        return f"ESP:brck:{int(cart_id)}"
    return f"ESP:shpcart:{int(cart_id)}"


def basket_scan_code(basket_id: int) -> str:
    return f"ESP:bsh:{int(basket_id)}"


def bin_scan_code(bin_id: int) -> str:
    return f"ESP:sh:{int(bin_id)}"


def order_scan_code(order_id: int) -> str:
    return f"ESP:O:{int(order_id)}"


def parse_esp_scan(raw: str) -> tuple[EspEntityKind, int] | None:
    """
    Parse a scanned token into (logical kind, id).
    Returns None if the string is not a valid ESP scan code.
    """
    s = (raw or "").strip()
    m = ESP_SCAN_RE.match(s)
    if not m:
        return None
    token = m.group("kind").lower()
    pid = int(m.group("pid"))
    if token == "shpcart":
        return ("cart_bulk", pid)
    if token == "brck":
        return ("cart_multi", pid)
    if token == "bsh":
        return ("basket", pid)
    if token == "sh":
        return ("location", pid)
    if token == "o":
        return ("order", pid)
    return None


def assign_cart_scan_code(cart: Any) -> None:
    if getattr(cart, "id", None) is None:
        return
    cart.scan_code = cart_scan_code_for_type(cart.type, int(cart.id))


def assign_basket_scan_code(basket: Any) -> None:
    if getattr(basket, "id", None) is None:
        return
    basket.scan_code = basket_scan_code(int(basket.id))


def assign_order_scan_code(order: Any) -> None:
    if getattr(order, "id", None) is None:
        return
    order.scan_code = order_scan_code(int(order.id))


def assign_bin_scan_code(bin_row: Any) -> None:
    if getattr(bin_row, "id", None) is None:
        return
    bin_row.scan_code = bin_scan_code(int(bin_row.id))


def find_cart_for_tenant_warehouse_scan(
    db: Any,
    tenant_id: int,
    warehouse_id: int,
    code: str,
) -> Any:
    """
    Resolve a cart for WMS endpoints (tenant + warehouse): ESP cart/basket tokens or legacy code/barcode/scan_code.
    """
    from sqlalchemy import func, or_

    from ..models.cart import Cart
    from ..models.cart_basket import CartBasket

    c = (code or "").strip()
    if not c:
        return None
    parsed = parse_esp_scan(c)
    if parsed:
        kind, eid = parsed
        if kind == "basket":
            b = db.query(CartBasket).filter(CartBasket.id == int(eid)).first()
            if not b:
                return None
            return (
                db.query(Cart)
                .filter(
                    Cart.id == b.cart_id,
                    Cart.tenant_id == int(tenant_id),
                    Cart.warehouse_id == int(warehouse_id),
                )
                .first()
            )
        if kind == "cart_bulk":
            row = (
                db.query(Cart)
                .filter(
                    Cart.id == int(eid),
                    Cart.tenant_id == int(tenant_id),
                    Cart.warehouse_id == int(warehouse_id),
                )
                .first()
            )
            if row and not cart_type_is_multi(row.type):
                return row
            return None
        if kind == "cart_multi":
            row = (
                db.query(Cart)
                .filter(
                    Cart.id == int(eid),
                    Cart.tenant_id == int(tenant_id),
                    Cart.warehouse_id == int(warehouse_id),
                )
                .first()
            )
            if row and cart_type_is_multi(row.type):
                return row
            return None
        return None
    low = c.lower()
    return (
        db.query(Cart)
        .filter(
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
            or_(Cart.code == c, Cart.barcode == c, func.lower(Cart.scan_code) == low),
        )
        .first()
    )
