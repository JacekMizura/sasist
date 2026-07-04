"""Daily sales history for forecast strategies (warehouse-scoped)."""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem
from .constants import TERMINAL_FULFILLMENT_STATE, TERMINAL_ORDER_STATUS


def _day_col():
    return func.date(func.coalesce(Order.order_date, Order.created_at))


def daily_sales_series_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    lookback_days: int,
) -> list[tuple[date, float]]:
    """Last N calendar days of sales qty (oldest → newest), zeros filled."""
    days = max(1, int(lookback_days))
    since = datetime.utcnow() - timedelta(days=days - 1)
    status_upper = func.upper(func.coalesce(Order.status, ""))
    rows = (
        db.query(_day_col().label("day"), func.coalesce(func.sum(OrderItem.quantity), 0.0))
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            OrderItem.product_id == int(product_id),
            Order.deleted_at.is_(None),
            func.coalesce(Order.order_date, Order.created_at) >= since,
            ~status_upper.in_(tuple(TERMINAL_ORDER_STATUS)),
            or_(Order.fulfillment_state.is_(None), ~Order.fulfillment_state.in_(tuple(TERMINAL_FULFILLMENT_STATE))),
        )
        .group_by(_day_col())
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
