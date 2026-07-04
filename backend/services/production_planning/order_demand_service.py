"""Open sales-order demand for manufactured finished goods."""

from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem
from .constants import TERMINAL_FULFILLMENT_STATE, TERMINAL_ORDER_STATUS


def _open_orders_filter(tenant_id: int, warehouse_id: int):
    status_upper = func.upper(func.coalesce(Order.status, ""))
    return (
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
        Order.deleted_at.is_(None),
        ~status_upper.in_(tuple(TERMINAL_ORDER_STATUS)),
        or_(Order.fulfillment_state.is_(None), ~Order.fulfillment_state.in_(tuple(TERMINAL_FULFILLMENT_STATE))),
        Order.packed_at.is_(None),
    )


def order_demand_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
) -> dict[int, float]:
    """
    Sum OrderItem.quantity for open orders (pending, picking, reserved pipeline).

    Excludes shipped, cancelled, completed, archived; excludes packed orders.
    """
    filters = list(_open_orders_filter(tenant_id, warehouse_id))
    q = (
        db.query(OrderItem.product_id, func.coalesce(func.sum(OrderItem.quantity), 0.0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(*filters)
        .group_by(OrderItem.product_id)
    )
    if product_ids:
        q = q.filter(OrderItem.product_id.in_(tuple(int(x) for x in product_ids)))
    out: dict[int, float] = defaultdict(float)
    for pid, qty in q.all():
        out[int(pid)] = max(0.0, float(qty or 0))
    return dict(out)
