"""P4.17 — Wave picking aggregation: STOCK by bundle SKU, ON_DEMAND by components."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.order_item import OrderItem
from ..bundle_operational_mode import STOCK_PRODUCTION
from ..bundle_order_item_ops import (
    bundle_fulfillment_mode_from_order_item,
    order_item_skip_bundle_commercial_header_for_ops,
)


def wave_aggregate_product_id_for_line(item: OrderItem) -> int:
    """Aggregate key product_id for wave task generation."""
    if order_item_skip_bundle_commercial_header_for_ops(item):
        return 0
    return int(item.product_id)


def wave_aggregate_mode_for_order_items(items: list[OrderItem]) -> str:
    """
    Returns ``stock_bundle_sku`` when order has STOCK bundle parent operational line,
    else ``on_demand_components``.
    """
    for it in items or []:
        if bool(getattr(it, "is_bundle_parent", False)):
            mode = bundle_fulfillment_mode_from_order_item(it)
            if mode == STOCK_PRODUCTION:
                return "stock_bundle_sku"
    return "on_demand_components"


def wave_aggregate_lines(db: Session, order_id: int) -> dict[int, float]:
    """product_id → qty for wave (operational lines only)."""
    from ...models.order import Order

    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        return {}
    out: dict[int, float] = {}
    for it in order.items or []:
        if order_item_skip_bundle_commercial_header_for_ops(it):
            continue
        pid = wave_aggregate_product_id_for_line(it)
        if pid <= 0:
            continue
        out[pid] = out.get(pid, 0.0) + float(it.quantity or 0)
    return out
