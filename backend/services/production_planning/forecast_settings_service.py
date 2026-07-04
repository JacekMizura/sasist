"""Load production forecast settings from wms_settings row."""

from __future__ import annotations

import json
from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...schemas.wms_production_settings import ProductionForecastSettings
from ..inventory_management_policy_service import get_or_create_wms_settings_row
from .constants import DEFAULT_FORECAST_STRATEGY, DEFAULT_SALES_LOOKBACK_DAYS


def parse_forecast_settings_json(raw: str | None) -> ProductionForecastSettings:
    if not raw:
        return ProductionForecastSettings()
    try:
        data = json.loads(str(raw))
        if not isinstance(data, dict):
            return ProductionForecastSettings()
        return ProductionForecastSettings.model_validate(data)
    except (TypeError, ValueError, json.JSONDecodeError):
        return ProductionForecastSettings()


def load_forecast_settings(db: Session, *, tenant_id: int, warehouse_id: int) -> ProductionForecastSettings:
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    raw = getattr(row, "production_forecast_json", None)
    settings = parse_forecast_settings_json(raw)
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
    return settings


def save_forecast_settings(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    settings: ProductionForecastSettings,
) -> ProductionForecastSettings:
    row = get_or_create_wms_settings_row(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    row.production_forecast_json = json.dumps(settings.model_dump(), ensure_ascii=False)
    db.flush()
    return settings
