"""Average daily sales from a configurable lookback window (not full history)."""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem
from .constants import DEFAULT_SALES_LOOKBACK_DAYS, TERMINAL_FULFILLMENT_STATE, TERMINAL_ORDER_STATUS


def _sold_qty_in_period(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None,
    lookback_days: int,
) -> dict[int, float]:
    since = datetime.utcnow() - timedelta(days=int(lookback_days))
    status_upper = func.upper(func.coalesce(Order.status, ""))
    q = (
        db.query(
            OrderItem.product_id,
            func.coalesce(func.sum(OrderItem.quantity), 0.0),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.deleted_at.is_(None),
            func.coalesce(Order.order_date, Order.created_at) >= since,
            ~status_upper.in_(tuple(TERMINAL_ORDER_STATUS)),
            or_(Order.fulfillment_state.is_(None), ~Order.fulfillment_state.in_(tuple(TERMINAL_FULFILLMENT_STATE))),
        )
        .group_by(OrderItem.product_id)
    )
    if product_ids:
        q = q.filter(OrderItem.product_id.in_(tuple(int(x) for x in product_ids)))
    return {int(pid): max(0.0, float(qty or 0)) for pid, qty in q.all()}


def average_daily_sales_by_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int] | None = None,
    lookback_days: int = DEFAULT_SALES_LOOKBACK_DAYS,
) -> dict[int, float]:
    """
    avg_daily = total_sold_in_lookback / lookback_days

    Uses calendar days in window (including zero-sale days) — conservative MRP baseline.
    """
    days = max(1, int(lookback_days))
    totals = _sold_qty_in_period(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=product_ids,
        lookback_days=days,
    )
    if product_ids:
        return {int(pid): totals.get(int(pid), 0.0) / days for pid in product_ids}
    return {pid: qty / days for pid, qty in totals.items()}


def forecast_target_stock(avg_daily: float, coverage_days: int) -> float:
    return max(0.0, float(avg_daily) * max(1, int(coverage_days)))


def forecast_production_needed(
    *,
    avg_daily: float,
    coverage_days: int,
    on_hand: float,
    in_pipeline: float,
) -> float:
    target = forecast_target_stock(avg_daily, coverage_days)
    return max(0.0, target - float(on_hand) - float(in_pipeline))
