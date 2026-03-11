"""
Advanced sales forecasting: warehouse and product level.

Uses orders + order_items. order_date with created_at fallback.
Designed to support later: seasonality by month, promotion detection, ML models.
"""

import logging
from datetime import datetime, timedelta, date
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem

logger = logging.getLogger(__name__)

WEEKDAY_NAMES = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
HISTORY_DAYS = 90
MOVING_AVG_DAYS = 14
FORECAST_DAYS = 14
MIN_DAYS_FOR_FORECAST = 14


def _order_day_col():
    """Expression for order day: date(COALESCE(order_date, created_at))."""
    return func.date(func.coalesce(Order.order_date, Order.created_at))


def get_daily_sales_history(db: Session, warehouse_id: int, days: int = HISTORY_DAYS) -> list[dict[str, Any]]:
    """
    Last N days of orders for warehouse, grouped by day.
    Returns [{"date": "YYYY-MM-DD", "orders": count, "items": total_quantity}].
    """
    since = datetime.utcnow() - timedelta(days=days)
    day_col = _order_day_col()
    # Orders per day
    order_rows = (
        db.query(day_col.label("day"), func.count(Order.id).label("orders"))
        .filter(
            Order.warehouse_id == warehouse_id,
            func.coalesce(Order.order_date, Order.created_at) >= since,
        )
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    order_counts = {str(r.day): int(r.orders) for r in order_rows if r.day}
    # Items per day (sum quantity from order_items for orders in warehouse)
    item_rows = (
        db.query(_order_day_col().label("day"), func.coalesce(func.sum(OrderItem.quantity), 0).label("items"))
        .select_from(OrderItem)
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            Order.warehouse_id == warehouse_id,
            func.coalesce(Order.order_date, Order.created_at) >= since,
        )
        .group_by(_order_day_col())
        .all()
    )
    item_totals = {str(r.day): int(r.items) for r in item_rows if r.day}
    all_days = sorted(set(order_counts.keys()) | set(item_totals.keys()))
    return [
        {
            "date": d,
            "orders": order_counts.get(d, 0),
            "items": item_totals.get(d, 0),
        }
        for d in all_days
    ]


def calculate_weekday_pattern(history: list[dict[str, Any]]) -> dict[str, float]:
    """
    Group historical orders by weekday, normalize to weekly average = 1.0.
    Returns e.g. {"monday": 1.1, "friday": 1.4, "sunday": 0.5}.
    """
    by_weekday: dict[int, list[int]] = {i: [] for i in range(7)}
    for h in history:
        try:
            dt = date.fromisoformat(h["date"])
            # Monday=0, Sunday=6
            wd = dt.weekday()
            by_weekday[wd].append(h.get("orders", 0))
        except (ValueError, TypeError):
            continue
    totals = [sum(by_weekday[i]) for i in range(7)]
    week_total = sum(totals)
    if week_total == 0:
        return {WEEKDAY_NAMES[i]: 1.0 for i in range(7)}
    weekly_avg = week_total / 7.0
    return {
        WEEKDAY_NAMES[i]: (totals[i] / weekly_avg) if weekly_avg else 1.0
        for i in range(7)
    }


def get_warehouse_forecast(db: Session, warehouse_id: int) -> dict[str, Any]:
    """
    History (last 90 days, daily orders + items), weekday multipliers,
    14-day moving average base, forecast next 14 days = base_demand × weekday_multiplier.
    """
    history = get_daily_sales_history(db, warehouse_id, days=HISTORY_DAYS)
    # Fill missing days with 0 for a continuous series
    end_date = date.today()
    start_date = end_date - timedelta(days=HISTORY_DAYS - 1)
    day_to_data: dict[str, dict] = {h["date"]: h for h in history}
    series: list[dict[str, Any]] = []
    d = start_date
    while d <= end_date:
        key = d.isoformat()
        series.append(day_to_data.get(key, {"date": key, "orders": 0, "items": 0}))
        d += timedelta(days=1)
    days_with_data = sum(1 for s in series if s.get("orders", 0) > 0)
    orders_count = sum(s.get("orders", 0) for s in series)
    logger.info(
        "sales_forecast_warehouse: warehouse_id=%s orders_count=%s days_detected=%s",
        warehouse_id, orders_count, days_with_data,
    )
    if days_with_data < MIN_DAYS_FOR_FORECAST:
        return {
            "history": series,
            "forecast": [],
            "weekday_pattern": {},
            "message": "Not enough historical data for forecasting.",
        }
    weekday_mult = calculate_weekday_pattern(series)
    # 14-day moving average of orders (trailing)
    base_demand = 0.0
    if len(series) >= MOVING_AVG_DAYS:
        base_demand = sum(series[i]["orders"] for i in range(-MOVING_AVG_DAYS, 0)) / MOVING_AVG_DAYS
    else:
        base_demand = sum(s["orders"] for s in series) / max(1, len(series))
    forecast = []
    for i in range(FORECAST_DAYS):
        fd = end_date + timedelta(days=i + 1)
        wd = fd.weekday()
        mult = weekday_mult.get(WEEKDAY_NAMES[wd], 1.0)
        forecast.append({
            "date": fd.isoformat(),
            "predicted_orders": round(base_demand * mult, 1),
        })
    return {
        "history": series,
        "forecast": forecast,
        "weekday_pattern": weekday_mult,
    }


def get_product_daily_history(db: Session, product_id: int, days: int = HISTORY_DAYS) -> list[dict[str, Any]]:
    """Last N days of quantity sold per day for a product (all warehouses)."""
    since = datetime.utcnow() - timedelta(days=days)
    day_col = func.date(func.coalesce(Order.order_date, Order.created_at))
    rows = (
        db.query(day_col.label("day"), func.coalesce(func.sum(OrderItem.quantity), 0).label("quantity"))
        .join(Order, OrderItem.order_id == Order.id)
        .filter(
            OrderItem.product_id == product_id,
            func.coalesce(Order.order_date, Order.created_at) >= since,
        )
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    return [{"date": str(r.day), "quantity": int(r.quantity)} for r in rows if r.day]


def calculate_product_forecast(db: Session, product_id: int) -> dict[str, Any]:
    """
    Last 90 days quantity per day, 14-day MA, weekday multipliers, forecast next 14 days.
    Returns {"product_id", "history": [...], "forecast": [...]}.
    """
    raw = get_product_daily_history(db, product_id, days=HISTORY_DAYS)
    end_date = date.today()
    start_date = end_date - timedelta(days=HISTORY_DAYS - 1)
    day_to_qty: dict[str, int] = {h["date"]: h["quantity"] for h in raw}
    history = []
    d = start_date
    while d <= end_date:
        key = d.isoformat()
        q = day_to_qty.get(key, 0)
        history.append({"date": key, "quantity": q})
        d += timedelta(days=1)
    days_with_data = sum(1 for h in history if h["quantity"] > 0)
    total_qty = sum(h["quantity"] for h in history)
    logger.info(
        "sales_forecast_product: product_id=%s total_quantity=%s days_detected=%s",
        product_id, total_qty, days_with_data,
    )
    if days_with_data < MIN_DAYS_FOR_FORECAST:
        return {
            "product_id": product_id,
            "history": history,
            "forecast": [],
            "message": "Not enough historical data for forecasting.",
        }
    # Use quantity as "orders" for weekday pattern (demand shape)
    history_for_pattern = [{"date": h["date"], "orders": h["quantity"]} for h in history]
    weekday_mult = calculate_weekday_pattern(history_for_pattern)
    base_demand = 0.0
    if len(history) >= MOVING_AVG_DAYS:
        base_demand = sum(history[i]["quantity"] for i in range(-MOVING_AVG_DAYS, 0)) / MOVING_AVG_DAYS
    else:
        base_demand = total_qty / max(1, len(history))
    forecast = []
    for i in range(FORECAST_DAYS):
        fd = end_date + timedelta(days=i + 1)
        wd = fd.weekday()
        mult = weekday_mult.get(WEEKDAY_NAMES[wd], 1.0)
        forecast.append({
            "date": fd.isoformat(),
            "predicted_quantity": round(base_demand * mult, 1),
        })
    return {
        "product_id": product_id,
        "history": history,
        "forecast": forecast,
    }
