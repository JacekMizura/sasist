"""Production priority and coverage indicators."""

from __future__ import annotations

from .constants import (
    COVERAGE_COLOR_COMFORT,
    COVERAGE_COLOR_CRITICAL,
    COVERAGE_COLOR_OK,
    COVERAGE_COLOR_WARNING,
    PRIORITY_CRITICAL,
    PRIORITY_HIGH,
    PRIORITY_LOW,
    PRIORITY_MEDIUM,
)


def coverage_days(*, on_hand: float, avg_daily: float) -> float | None:
    if avg_daily <= 1e-9:
        return None
    return float(on_hand) / float(avg_daily)


def coverage_color(days: float | None) -> str:
    if days is None:
        return COVERAGE_COLOR_COMFORT
    if days < 7:
        return COVERAGE_COLOR_CRITICAL
    if days < 14:
        return COVERAGE_COLOR_WARNING
    if days <= 30:
        return COVERAGE_COLOR_OK
    return COVERAGE_COLOR_COMFORT


def production_priority(
    *,
    order_demand: float,
    on_hand: float,
    in_pipeline: float,
    coverage_days_value: float | None,
) -> str:
    """
    CRITICAL — cannot cover open orders with stock + pipeline.
    HIGH — coverage < 7 days.
    MEDIUM — 7–14 days.
    LOW — > 14 days (or no sales velocity).
    """
    supply = float(on_hand) + float(in_pipeline)
    if float(order_demand) > supply + 1e-6:
        return PRIORITY_CRITICAL
    if coverage_days_value is not None:
        if coverage_days_value < 7:
            return PRIORITY_HIGH
        if coverage_days_value < 14:
            return PRIORITY_MEDIUM
    return PRIORITY_LOW
