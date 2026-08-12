"""Load production forecast settings from wms_settings row."""

from __future__ import annotations

import json

from sqlalchemy.orm import Session

from ...schemas.wms_production_settings import ProductionForecastSettings
from ..inventory_management_policy_service import get_or_create_wms_settings_row
from .constants import (
    DEFAULT_FORECAST_STRATEGY,
    DEFAULT_SALES_LOOKBACK_DAYS,
    DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS,
    STOCK_REPLENISHMENT_COVERAGE_PRESETS,
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
