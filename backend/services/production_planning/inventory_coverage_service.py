"""Inventory coverage metrics."""

from __future__ import annotations

from .constants import (
    COVERAGE_COLOR_COMFORT,
    COVERAGE_COLOR_CRITICAL,
    COVERAGE_COLOR_OK,
    COVERAGE_COLOR_WARNING,
)


def coverage_days(*, on_hand: float, avg_daily: float) -> float | None:
    if avg_daily <= 1e-9:
        return None
    return float(on_hand) / float(avg_daily)


def coverage_after_production(
    *,
    on_hand: float,
    in_pipeline: float,
    production_qty: float,
    avg_daily: float,
    lead_time_days: int,
) -> float | None:
    """Projected coverage after production completes (consumption during lead time)."""
    if avg_daily <= 1e-9:
        return None
    projected = on_hand + in_pipeline + production_qty - (avg_daily * max(0, lead_time_days))
    return max(0.0, projected) / avg_daily


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
