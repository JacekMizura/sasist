"""Polish display defaults for direct-sale (stationary retail) orders."""

from __future__ import annotations

from typing import TYPE_CHECKING, Optional, Tuple

if TYPE_CHECKING:
    from ...models.order import Order

DIRECT_SALE_CHANNEL = "DIRECT_SALE"
STATIONARY_SALE_LABEL = "Sprzedaż stacjonarna"
RETAIL_CUSTOMER_LABEL = "Klient detaliczny"
PICKUP_DELIVERY_LABEL = "Odbiór osobisty"


def is_direct_sale_order(order: "Order") -> bool:
    ch = str(getattr(order, "order_channel", None) or "").strip().upper()
    src = str(getattr(order, "source", None) or "").strip().lower()
    return ch == DIRECT_SALE_CHANNEL or src in ("direct-sales", "direct_sales")


def direct_sale_customer_names(order: "Order") -> Tuple[Optional[str], Optional[str]]:
    """Retail POS: show stationary sale label when no named customer."""
    if not is_direct_sale_order(order):
        return None, None
    if getattr(order, "customer_id", None):
        return None, None
    return STATIONARY_SALE_LABEL, None


def direct_sale_shipping_display(order: "Order") -> Tuple[Optional[str], Optional[str], Optional[str]]:
    if not is_direct_sale_order(order):
        return None, None, None
    return PICKUP_DELIVERY_LABEL, None, None
