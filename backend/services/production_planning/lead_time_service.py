"""Production lead time helpers."""

from __future__ import annotations

from datetime import date, timedelta


def lead_time_days(product) -> int:
    raw = getattr(product, "production_lead_time_days", None)
    if raw is None:
        return 0
    try:
        return max(0, int(raw))
    except (TypeError, ValueError):
        return 0


def stockout_before_production_complete(coverage_days_value: float | None, lead_time: int) -> bool:
    if lead_time <= 0 or coverage_days_value is None:
        return False
    return coverage_days_value < float(lead_time)


def estimated_completion_date(*, from_date: date | None = None, lead_time: int) -> date:
    base = from_date or date.today()
    return base + timedelta(days=max(0, int(lead_time)))
