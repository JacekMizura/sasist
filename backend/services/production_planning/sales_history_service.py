"""Daily sales history for forecast strategies (warehouse-scoped).

Forecast must use realized sales only — never the same open orders that feed
``order_demand`` (see ``order_demand_service``).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem
from .constants import (
    CANCELLED_LIKE_ORDER_STATUS,
    REALIZED_SALES_FULFILLMENT_STATE,
    REALIZED_SALES_ORDER_STATUS,
)


def _realization_day_col():
    """Prefer packed_at (fulfillment marker), then order_date / created_at."""
    return func.date(func.coalesce(Order.packed_at, Order.order_date, Order.created_at))


def _realized_sales_filters(tenant_id: int, warehouse_id: int):
    """
    Realized sales = packed OR terminal shipped/completed status/fulfillment,
    excluding cancelled/returned/archived.
    """
    status_upper = func.upper(func.coalesce(Order.status, ""))
    return (
        Order.tenant_id == int(tenant_id),
        Order.warehouse_id == int(warehouse_id),
        Order.deleted_at.is_(None),
        ~status_upper.in_(tuple(CANCELLED_LIKE_ORDER_STATUS)),
        or_(
            Order.packed_at.isnot(None),
            status_upper.in_(tuple(REALIZED_SALES_ORDER_STATUS)),
            Order.fulfillment_state.in_(tuple(REALIZED_SALES_FULFILLMENT_STATE)),
        ),
    )


def daily_sales_series_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    lookback_days: int,
) -> list[tuple[date, float]]:
    """Last N calendar days of realized sales qty (oldest → newest), zeros filled."""
    days = max(1, int(lookback_days))
    since = datetime.utcnow() - timedelta(days=days - 1)
    day_col = _realization_day_col()
    rows = (
        db.query(day_col.label("day"), func.coalesce(func.sum(OrderItem.quantity), 0.0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            *_realized_sales_filters(tenant_id, warehouse_id),
            OrderItem.product_id == int(product_id),
            func.coalesce(Order.packed_at, Order.order_date, Order.created_at) >= since,
        )
        .group_by(day_col)
        .all()
    )
    by_day = {r.day: float(r[1] or 0) for r in rows if r.day}
    end = date.today()
    start = end - timedelta(days=days - 1)
    out: list[tuple[date, float]] = []
    d = start
    while d <= end:
        out.append((d, by_day.get(d, 0.0)))
        d += timedelta(days=1)
    return out


def bulk_daily_sales_series(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int],
    lookback_days: int,
) -> dict[int, list[tuple[date, float]]]:
    return {
        int(pid): daily_sales_series_for_product(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            product_id=int(pid),
            lookback_days=lookback_days,
        )
        for pid in product_ids
    }
