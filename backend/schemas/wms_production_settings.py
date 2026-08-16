import json
from typing import Any, Literal

from pydantic import BaseModel, Field

from ..services.production_planning.constants import (
    DEFAULT_FORECAST_STRATEGY,
    DEFAULT_SALES_LOOKBACK_DAYS,
    DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS,
    DEFAULT_STOCK_REPLENISHMENT_INTERVAL,
    STOCK_REPLENISHMENT_COVERAGE_PRESETS,
    STOCK_REPLENISHMENT_INTERVAL_PRESETS,
)

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


class ProductionTraceabilitySettings(BaseModel):
    mode: Literal["OFF", "CONFIGURED"] = "OFF"
    require_batch: bool = False
    require_serial: bool = False
    require_expiry: bool = False


StockReplenishmentCoverageDays = Literal[1, 3, 7, 14]
StockReplenishmentInterval = Literal["hourly", "every_3_hours", "every_6_hours", "daily"]


class ProductionForecastSettings(BaseModel):
    strategy: ForecastStrategyKey = DEFAULT_FORECAST_STRATEGY  # type: ignore[assignment]
    sales_lookback_days: int = Field(DEFAULT_SALES_LOOKBACK_DAYS, ge=7, le=365)
    #: Automatyczne uzupełnianie zapasu (nadprodukcja) na podstawie rotacji.
    auto_stock_replenishment: bool = False
    #: Docelowe pokrycie sprzedaży — tylko 1 / 3 / 7 / 14 dni.
    stock_replenishment_coverage_days: StockReplenishmentCoverageDays = (
        DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS  # type: ignore[assignment]
    )
    #: Jak często uruchamiać automatyczne przeliczanie (gdy auto ON).
    stock_replenishment_interval: StockReplenishmentInterval = (
        DEFAULT_STOCK_REPLENISHMENT_INTERVAL  # type: ignore[assignment]
    )
    #: ISO timestamp ostatniego udanego runu (manual lub scheduler).
    last_replenishment_run_at: str | None = None
    #: Krótki wynik ostatniego runu (bez historii jobów).
    last_replenishment_run_summary: dict[str, Any] | None = None

    def normalized_replenishment_coverage_days(self) -> int:
        days = int(self.stock_replenishment_coverage_days or DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS)
        if days not in STOCK_REPLENISHMENT_COVERAGE_PRESETS:
            return int(DEFAULT_STOCK_REPLENISHMENT_COVERAGE_DAYS)
        return days

    def normalized_replenishment_interval(self) -> str:
        raw = str(self.stock_replenishment_interval or DEFAULT_STOCK_REPLENISHMENT_INTERVAL)
        if raw not in STOCK_REPLENISHMENT_INTERVAL_PRESETS:
            return str(DEFAULT_STOCK_REPLENISHMENT_INTERVAL)
        return raw


AllocationStrategyKey = Literal["FIFO", "FEFO", "LIFO"]


class ProductionReservationSettings(BaseModel):
    allocation_strategy: AllocationStrategyKey = "FEFO"
    allow_sales_locations: bool = False


class WmsProductionSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    terminal_display: ProductionTerminalDisplaySettings = Field(default_factory=ProductionTerminalDisplaySettings)
    terminal_required: ProductionTerminalRequiredSettings = Field(default_factory=ProductionTerminalRequiredSettings)
    forecast: ProductionForecastSettings = Field(default_factory=ProductionForecastSettings)
    reservation: ProductionReservationSettings = Field(default_factory=ProductionReservationSettings)
    traceability: ProductionTraceabilitySettings = Field(default_factory=ProductionTraceabilitySettings)


class WmsProductionSettingsSave(BaseModel):
    tenant_id: int
    warehouse_id: int | None = None
    terminal_display: ProductionTerminalDisplaySettings
    # Legacy JSON blob — unused in v1 UI; kept optional so clients need not round-trip it.
    terminal_required: ProductionTerminalRequiredSettings = Field(
        default_factory=ProductionTerminalRequiredSettings
    )
    forecast: ProductionForecastSettings = Field(default_factory=ProductionForecastSettings)
    reservation: ProductionReservationSettings = Field(default_factory=ProductionReservationSettings)
    traceability: ProductionTraceabilitySettings = Field(default_factory=ProductionTraceabilitySettings)


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

    wh = getattr(row, "warehouse_id", None)
    tid = getattr(row, "tenant_id", None)
    return parse_forecast_settings_json(
        getattr(row, "production_forecast_json", None),
        warehouse_id=int(wh) if wh is not None else None,
        tenant_id=int(tid) if tid is not None else None,
    )


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
        allow_sales = bool(parsed.get("allow_sales_locations", False))
        return ProductionReservationSettings(allocation_strategy=strat, allow_sales_locations=allow_sales)  # type: ignore[arg-type]
    except (TypeError, ValueError, json.JSONDecodeError):
        return ProductionReservationSettings()


def traceability_settings_from_row(row: Any) -> ProductionTraceabilitySettings:
    from ..services.production_execution.production_traceability_policy import (
        parse_production_traceability_settings,
    )

    return ProductionTraceabilitySettings(
        **parse_production_traceability_settings(
            getattr(row, "production_traceability_json", None)
        )
    )
