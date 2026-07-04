"""Production planning priority engine."""

from __future__ import annotations

from .constants import PRIORITY_CRITICAL, PRIORITY_HIGH, PRIORITY_LOW, PRIORITY_MEDIUM
from .lead_time_service import stockout_before_production_complete


def compute_priority(
    *,
    order_demand: float,
    on_hand: float,
    in_pipeline: float,
    coverage_days_value: float | None,
    lead_time: int,
    recommended_qty: float,
) -> str:
    supply = float(on_hand) + float(in_pipeline)
    if float(order_demand) > supply + 1e-6:
        return PRIORITY_CRITICAL
    if stockout_before_production_complete(coverage_days_value, lead_time) and recommended_qty > 1e-6:
        return PRIORITY_CRITICAL
    if coverage_days_value is not None:
        if coverage_days_value < 7:
            return PRIORITY_HIGH
        if coverage_days_value < 14:
            return PRIORITY_MEDIUM
    return PRIORITY_LOW
