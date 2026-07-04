import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..services.production_planning.constants import DEFAULT_FORECAST_STRATEGY, DEFAULT_SALES_LOOKBACK_DAYS

DEFAULT_PRODUCTION_TERMINAL_DISPLAY: dict[str, bool] = {
    "show_product_image": True,
    "show_name": True,
    "show_sku": True,
    "show_ean": True,
    "show_catalog_number": True,
    "show_source_location": True,
    "show_target_location": False,
    "show_stock_level": True,
    "show_unit": True,
    "show_barcode": True,
}

DEFAULT_PRODUCTION_TERMINAL_REQUIRED: dict[str, bool] = {
    "require_batch_number": False,
    "require_serial": False,
    "require_lot": False,
    "require_production_date": False,
    "require_expiry_date": False,
    "require_operator": False,
    "require_quality_control": False,
}

ForecastStrategyKey = Literal[
    "PERIOD_AVERAGE",
    "WEIGHTED_AVERAGE",
    "WEEKDAY_AVERAGE",
    "MEDIAN",
    "MAX_DAILY",
    "AI_SMART",
]


class ProductionTerminalDisplaySettings(BaseModel):
    show_product_image: bool = True
    show_name: bool = True
    show_sku: bool = True
    show_ean: bool = True
    show_catalog_number: bool = True
    show_source_location: bool = True
    show_target_location: bool = False
    show_stock_level: bool = True
    show_unit: bool = True
    show_barcode: bool = True


class ProductionTerminalRequiredSettings(BaseModel):
    require_batch_number: bool = False
    require_serial: bool = False
    require_lot: bool = False
    require_production_date: bool = False
    require_expiry_date: bool = False
    require_operator: bool = False
    require_quality_control: bool = False


class ProductionForecastSettings(BaseModel):
    strategy: ForecastStrategyKey = DEFAULT_FORECAST_STRATEGY  # type: ignore[assignment]
    sales_lookback_days: int = Field(DEFAULT_SALES_LOOKBACK_DAYS, ge=7, le=365)


AllocationStrategyKey = Literal["FIFO", "FEFO", "LIFO"]


class ProductionReservationSettings(BaseModel):
    allocation_strategy: AllocationStrategyKey = "FEFO"


class WmsProductionSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    terminal_display: ProductionTerminalDisplaySettings = Field(default_factory=ProductionTerminalDisplaySettings)
    terminal_required: ProductionTerminalRequiredSettings = Field(default_factory=ProductionTerminalRequiredSettings)
    forecast: ProductionForecastSettings = Field(default_factory=ProductionForecastSettings)
    reservation: ProductionReservationSettings = Field(default_factory=ProductionReservationSettings)


class WmsProductionSettingsSave(BaseModel):
    tenant_id: int
    warehouse_id: int | None = None
    terminal_display: ProductionTerminalDisplaySettings
    terminal_required: ProductionTerminalRequiredSettings
    forecast: ProductionForecastSettings = Field(default_factory=ProductionForecastSettings)
    reservation: ProductionReservationSettings = Field(default_factory=ProductionReservationSettings)


def parse_production_settings_json(raw: str | None, defaults: dict[str, bool]) -> dict[str, bool]:
    if not raw:
        return dict(defaults)
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return dict(defaults)
        out = dict(defaults)
        for k in defaults:
            if k in parsed:
                out[k] = bool(parsed[k])
        return out
    except (TypeError, ValueError, json.JSONDecodeError):
        return dict(defaults)


def production_settings_from_row(row: Any) -> tuple[ProductionTerminalDisplaySettings, ProductionTerminalRequiredSettings]:
    disp = parse_production_settings_json(
        getattr(row, "production_terminal_display_json", None),
        DEFAULT_PRODUCTION_TERMINAL_DISPLAY,
    )
    req = parse_production_settings_json(
        getattr(row, "production_terminal_required_json", None),
        DEFAULT_PRODUCTION_TERMINAL_REQUIRED,
    )
    return ProductionTerminalDisplaySettings(**disp), ProductionTerminalRequiredSettings(**req)


def forecast_settings_from_row(row: Any) -> ProductionForecastSettings:
    from ..services.production_planning.forecast_settings_service import parse_forecast_settings_json

    return parse_forecast_settings_json(getattr(row, "production_forecast_json", None))


def reservation_settings_from_row(row: Any) -> ProductionReservationSettings:
    raw = getattr(row, "production_reservation_json", None) or ""
    if not raw:
        return ProductionReservationSettings()
    try:
        parsed = json.loads(str(raw))
        if not isinstance(parsed, dict):
            return ProductionReservationSettings()
        strat = str(parsed.get("allocation_strategy") or "FEFO").upper()
        if strat not in ("FIFO", "FEFO", "LIFO"):
            strat = "FEFO"
        return ProductionReservationSettings(allocation_strategy=strat)  # type: ignore[arg-type]
    except (TypeError, ValueError, json.JSONDecodeError):
        return ProductionReservationSettings()
