"""Production quantity recommendation — min/max stock, MOQ, batch multiple."""

from __future__ import annotations

import math


def product_min_stock(product) -> float | None:
    v = getattr(product, "min_total_stock", None)
    if v is None:
        return None
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def product_max_stock(product) -> float | None:
    v = getattr(product, "max_total_stock", None)
    if v is None:
        return None
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def product_moq(product) -> float | None:
    v = getattr(product, "production_moq", None)
    if v is None:
        return None
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def product_batch_multiple(product) -> float | None:
    v = getattr(product, "production_batch_multiple", None)
    if v is None:
        return None
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def forecast_target_stock(
    *,
    daily_rate: float,
    coverage_days: int,
    min_stock: float | None,
    max_stock: float | None,
) -> float:
    forecast = float(daily_rate) * max(1, int(coverage_days))
    target = max(forecast, float(min_stock or 0.0))
    if max_stock is not None and max_stock > 0:
        target = min(target, max_stock)
    return target


def combined_production_need(
    *,
    order_demand: float,
    forecast_need: float,
    on_hand: float,
    in_pipeline: float,
) -> float:
    """Net production: order gap + stock gap minus existing supply (single subtraction)."""
    return max(0.0, float(order_demand) + float(forecast_need) - float(on_hand) - float(in_pipeline))


def raw_production_gap(
    *,
    order_demand: float,
    target_stock: float,
    on_hand: float,
    in_pipeline: float,
) -> float:
    """Gross gap vs stock target + orders (legacy helper)."""
    return max(0.0, float(order_demand) + float(target_stock) - float(on_hand) - float(in_pipeline))


def forecast_stock_need(
    *,
    daily_rate: float,
    coverage_days: int,
    min_stock: float | None,
    max_stock: float | None,
    on_hand: float,
    in_pipeline: float,
) -> float:
    target = forecast_target_stock(
        daily_rate=daily_rate,
        coverage_days=coverage_days,
        min_stock=min_stock,
        max_stock=max_stock,
    )
    return max(0.0, target - float(on_hand) - float(in_pipeline))


def apply_moq_and_multiple(raw_qty: float, moq: float | None, multiple: float | None) -> float:
    if raw_qty <= 1e-9:
        return 0.0
    qty = float(raw_qty)
    if multiple and multiple > 0:
        qty = math.ceil(qty / multiple) * multiple
    if moq and moq > 0:
        qty = max(qty, moq)
    if multiple and multiple > 0:
        qty = math.ceil(qty / multiple) * multiple
    return qty
