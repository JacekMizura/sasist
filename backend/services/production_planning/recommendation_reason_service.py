"""Human-readable recommendation reasons."""

from __future__ import annotations

from .constants import HIGH_SALES_DAILY_THRESHOLD
from .lead_time_service import stockout_before_production_complete
from .production_recommendation_service import product_min_stock


def build_recommendation_reasons(
    *,
    product,
    order_demand: float,
    on_hand: float,
    in_pipeline: float,
    coverage_days_value: float | None,
    lead_time: int,
    daily_rate: float,
    recommended_qty: float,
    forecast_target: float,
) -> list[str]:
    if recommended_qty <= 1e-6:
        return []

    reasons: list[str] = []
    supply = float(on_hand) + float(in_pipeline)

    if float(order_demand) > supply + 1e-6:
        reasons.append("Brak na zamówienia")

    if on_hand <= 1e-6 and (order_demand > 0 or forecast_target > 0):
        reasons.append("Brak zapasu")

    min_s = product_min_stock(product)
    if min_s is not None and on_hand + in_pipeline < min_s - 1e-6:
        reasons.append("Minimalny stan")

    if coverage_days_value is not None:
        if coverage_days_value < 7:
            reasons.append(f"Pokrycie {coverage_days_value:.0f} dni")
        elif coverage_days_value < 14:
            reasons.append(f"Pokrycie {coverage_days_value:.0f} dni")

    if stockout_before_production_complete(coverage_days_value, lead_time):
        reasons.append("Lead Time")

    if daily_rate >= HIGH_SALES_DAILY_THRESHOLD:
        reasons.append("Duża sprzedaż")

    return reasons
