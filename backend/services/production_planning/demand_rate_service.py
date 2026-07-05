"""Single orchestration for daily demand rates — settings, history, strategy."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...schemas.wms_production_settings import ProductionForecastSettings
from .forecast_settings_service import load_forecast_settings
from .forecast_strategies import DemandForecastStrategy, get_forecast_strategy
from .sales_history_service import bulk_daily_sales_series


@dataclass(frozen=True)
class DemandForecastContext:
    settings: ProductionForecastSettings
    strategy: DemandForecastStrategy
    lookback_days: int


def resolve_demand_forecast_context(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    forecast_strategy: str | None = None,
    sales_lookback_days: int | None = None,
) -> DemandForecastContext:
    """Load WMS forecast settings and resolve strategy + lookback (Planning + Material Portfolio SSOT)."""
    settings = load_forecast_settings(db, tenant_id=int(tenant_id), warehouse_id=int(warehouse_id))
    strategy_key = forecast_strategy or settings.strategy
    lookback = int(sales_lookback_days or settings.sales_lookback_days)
    strategy = get_forecast_strategy(strategy_key)
    return DemandForecastContext(settings=settings, strategy=strategy, lookback_days=lookback)


def bulk_product_daily_rates(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_ids: list[int],
    forecast_strategy: str | None = None,
    sales_lookback_days: int | None = None,
) -> tuple[dict[int, float], DemandForecastContext]:
    """Daily usage / sales velocity per product using the shared forecast engine."""
    if not product_ids:
        ctx = resolve_demand_forecast_context(
            db,
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            forecast_strategy=forecast_strategy,
            sales_lookback_days=sales_lookback_days,
        )
        return {}, ctx

    ctx = resolve_demand_forecast_context(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        forecast_strategy=forecast_strategy,
        sales_lookback_days=sales_lookback_days,
    )
    history_map = bulk_daily_sales_series(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_ids=[int(p) for p in product_ids],
        lookback_days=ctx.lookback_days,
    )
    rates = {
        int(pid): float(ctx.strategy.daily_rate(history_map.get(int(pid), [])))
        for pid in product_ids
    }
    return rates, ctx
