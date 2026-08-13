"""Load production forecast settings from wms_settings row."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...schemas.wms_production_settings import ProductionForecastSettings
from ..inventory_management_policy_service import get_or_create_wms_settings_row
from .constants import (
    DEFAULT_FORECAST_STRATEGY,
    DEFAULT_SALES_LOOKBACK_DAYS,
    DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS,
    DEFAULT_STOCK_REPLENISHMENT_INTERVAL,
    STOCK_REPLENISHMENT_COVERAGE_PRESETS,
    STOCK_REPLENISHMENT_INTERVAL_HOURS,
    STOCK_REPLENISHMENT_INTERVAL_PRESETS,
)


def parse_forecast_settings_json(raw: str | None) -> ProductionForecastSettings:
    if not raw:
        return ProductionForecastSettings()
    try:
        data = json.loads(str(raw))
        if not isinstance(data, dict):
            return ProductionForecastSettings()
        settings = ProductionForecastSettings.model_validate(data)
        return _normalize_forecast_settings(settings)
    except (TypeError, ValueError, json.JSONDecodeError):
        return ProductionForecastSettings()


def _normalize_forecast_settings(settings: ProductionForecastSettings) -> ProductionForecastSettings:
    if settings.strategy not in (
        "PERIOD_AVERAGE",
        "WEIGHTED_AVERAGE",
        "WEEKDAY_AVERAGE",
        "MEDIAN",
        "MAX_DAILY",
        "AI_SMART",
    ):
        settings.strategy = DEFAULT_FORECAST_STRATEGY  # type: ignore[assignment]
    if settings.sales_lookback_days < 7:
        settings.sales_lookback_days = DEFAULT_SALES_LOOKBACK_DAYS
    days = int(settings.stock_replenishment_coverage_days or DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS)
    if days not in STOCK_REPLENISHMENT_COVERAGE_PRESETS:
        settings.stock_replenishment_coverage_days = DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS  # type: ignore[assignment]
    else:
        settings.stock_replenishment_coverage_days = days  # type: ignore[assignment]
    settings.auto_stock_replenishment = bool(settings.auto_stock_replenishment)
    interval = str(settings.stock_replenishment_interval or DEFAULT_STOCK_REPLENISHMENT_INTERVAL)
    if interval not in STOCK_REPLENISHMENT_INTERVAL_PRESETS:
        settings.stock_replenishment_interval = DEFAULT_STOCK_REPLENISHMENT_INTERVAL  # type: ignore[assignment]
    else:
        settings.stock_replenishment_interval = interval  # type: ignore[assignment]
    if settings.last_replenishment_run_at is not None:
        settings.last_replenishment_run_at = str(settings.last_replenishment_run_at) or None
    if settings.last_replenishment_run_summary is not None and not isinstance(
        settings.last_replenishment_run_summary, dict
    ):
        settings.last_replenishment_run_summary = None
    return settings


def load_forecast_settings(db: Session, *, tenant_id: int, warehouse_id: int) -> ProductionForecastSettings:
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    raw = getattr(row, "production_forecast_json", None)
    return _normalize_forecast_settings(parse_forecast_settings_json(raw))


def save_forecast_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    settings: ProductionForecastSettings,
) -> ProductionForecastSettings:
    normalized = _normalize_forecast_settings(settings)
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    row.production_forecast_json = json.dumps(normalized.model_dump(), ensure_ascii=False)
    db.flush()
    return normalized


def replenishment_interval_hours(settings: ProductionForecastSettings) -> int:
    key = settings.normalized_replenishment_interval()
    return int(STOCK_REPLENISHMENT_INTERVAL_HOURS.get(key, 24))


def parse_last_replenishment_run_at(settings: ProductionForecastSettings) -> datetime | None:
    raw = settings.last_replenishment_run_at
    if not raw:
        return None
    try:
        return datetime.fromisoformat(str(raw).replace("Z", "+00:00").replace("+00:00", ""))
    except (TypeError, ValueError):
        return None


def is_stock_replenishment_due(
    settings: ProductionForecastSettings,
    *,
    now: datetime | None = None,
) -> bool:
    """True when auto replenishment should run for this warehouse settings row."""
    if not bool(settings.auto_stock_replenishment):
        return False
    now = now or datetime.utcnow()
    last = parse_last_replenishment_run_at(settings)
    if last is None:
        return True
    # Compare as naive UTC seconds (stored ISO without timezone).
    last_naive = last.replace(tzinfo=None) if last.tzinfo else last
    elapsed = (now - last_naive).total_seconds()
    return elapsed >= float(replenishment_interval_hours(settings)) * 3600.0


def record_replenishment_run(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    summary: dict[str, Any],
    ran_at: datetime | None = None,
) -> ProductionForecastSettings:
    """Persist last run stamp into production_forecast_json (no separate job table)."""
    settings = load_forecast_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    settings.last_replenishment_run_at = (ran_at or datetime.utcnow()).isoformat(timespec="seconds")
    settings.last_replenishment_run_summary = {
        "created_count": int(summary.get("created_count") or 0),
        "aggregated_count": int(summary.get("aggregated_count") or 0),
        "skipped_count": int(summary.get("skipped_count") or 0),
        "total_quantity": float(summary.get("total_quantity") or 0),
        "products_checked": int(summary.get("products_checked") or 0),
    }
    return save_forecast_settings(
        db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id), settings=settings
    )
