"""Production demand planning engine — MRP-lite read model."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.product import Product
from ...schemas.production_planning import (
    ProductionDemandPlanningRead,
    ProductionDemandProductRowRead,
    ProductionDemandSummaryRead,
)
from ..product_inventory_snapshot_service import inventory_snapshots_for_products
from ..production_recipe_card_service import list_recipe_cards
from .constants import (
    COVERAGE_DAY_PRESETS,
    DEFAULT_COVERAGE_DAYS,
    DEFAULT_SALES_LOOKBACK_DAYS,
    MAX_COVERAGE_DAYS,
    MAX_SALES_LOOKBACK_DAYS,
    MIN_COVERAGE_DAYS,
    MIN_SALES_LOOKBACK_DAYS,
)
from .order_demand_service import order_demand_by_product
from .pipeline_service import total_pipeline_qty_by_product
from .priority_service import coverage_color, coverage_days, production_priority
from .sales_velocity_service import (
    average_daily_sales_by_product,
    forecast_production_needed,
    forecast_target_stock,
)


def _clamp_coverage_days(value: int) -> int:
    return max(MIN_COVERAGE_DAYS, min(MAX_COVERAGE_DAYS, int(value)))


def _clamp_lookback_days(value: int) -> int:
    return max(MIN_SALES_LOOKBACK_DAYS, min(MAX_SALES_LOOKBACK_DAYS, int(value)))


def _round_qty(v: float) -> float:
    return round(max(0.0, float(v)), 2)


def get_production_demand_planning(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    coverage_days: int = DEFAULT_COVERAGE_DAYS,
    sales_lookback_days: int = DEFAULT_SALES_LOOKBACK_DAYS,
) -> ProductionDemandPlanningRead:
    coverage_days = _clamp_coverage_days(coverage_days)
    sales_lookback_days = _clamp_lookback_days(sales_lookback_days)

    recipes = list_recipe_cards(db, tenant_id=tenant_id, warehouse_id=warehouse_id, active_only=True)
    product_ids = [int(r.product_id) for r in recipes]
    composition_by_product = {int(r.product_id): int(r.composition_id) for r in recipes}

    if not product_ids:
        empty_summary = ProductionDemandSummaryRead(
            order_demand_total=0.0,
            order_production_needed=0.0,
            forecast_production_needed=0.0,
            combined_production_needed=0.0,
            on_hand_total=0.0,
            in_pipeline_total=0.0,
        )
        return ProductionDemandPlanningRead(
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            coverage_days=coverage_days,
            sales_lookback_days=sales_lookback_days,
            coverage_day_presets=list(COVERAGE_DAY_PRESETS),
            summary=empty_summary,
            products=[],
        )

    order_map = order_demand_by_product(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids)
    avg_daily_map = average_daily_sales_by_product(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_ids=product_ids,
        lookback_days=sales_lookback_days,
    )
    pipeline_map = total_pipeline_qty_by_product(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids
    )
    inv_map = inventory_snapshots_for_products(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_ids=product_ids)

    products_db = {
        int(p.id): p
        for p in db.query(Product).filter(Product.id.in_(tuple(product_ids)), Product.tenant_id == int(tenant_id)).all()
    }

    rows: list[ProductionDemandProductRowRead] = []
    sum_order_demand = 0.0
    sum_order_need = 0.0
    sum_forecast_need = 0.0
    sum_combined_need = 0.0
    sum_on_hand = 0.0
    sum_pipeline = 0.0

    for recipe in recipes:
        pid = int(recipe.product_id)
        order_demand = float(order_map.get(pid, 0.0))
        avg_daily = float(avg_daily_map.get(pid, 0.0))
        on_hand = float(inv_map.get(pid, {}).get("on_hand", 0.0) or 0.0)
        in_pipeline = float(pipeline_map.get(pid, 0.0))
        p = products_db.get(pid)

        target_stock = forecast_target_stock(avg_daily, coverage_days)
        forecast_need = forecast_production_needed(
            avg_daily=avg_daily,
            coverage_days=coverage_days,
            on_hand=on_hand,
            in_pipeline=in_pipeline,
        )
        order_need = max(0.0, order_demand - on_hand - in_pipeline)
        # Combined gap: both demand sources minus existing supply (not naive sum of targets).
        combined_need = max(0.0, order_demand + forecast_need - on_hand - in_pipeline)

        cov = coverage_days(on_hand=on_hand, avg_daily=avg_daily)
        priority = production_priority(
            order_demand=order_demand,
            on_hand=on_hand,
            in_pipeline=in_pipeline,
            coverage_days_value=cov,
        )

        row = ProductionDemandProductRowRead(
            product_id=pid,
            composition_id=composition_by_product.get(pid),
            product_name=str(recipe.product_name),
            product_sku=recipe.product_sku,
            product_image_url=recipe.product_image_url,
            on_hand=_round_qty(on_hand),
            avg_daily_sales=round(avg_daily, 4),
            coverage_days=round(cov, 1) if cov is not None else None,
            coverage_color=coverage_color(cov),
            in_pipeline=_round_qty(in_pipeline),
            order_demand=_round_qty(order_demand),
            forecast_demand=_round_qty(target_stock),
            forecast_production_needed=_round_qty(forecast_need),
            order_production_needed=_round_qty(order_need),
            combined_production_needed=_round_qty(combined_need),
            priority=priority,
        )
        rows.append(row)

        sum_order_demand += order_demand
        sum_order_need += order_need
        sum_forecast_need += forecast_need
        sum_combined_need += combined_need
        sum_on_hand += on_hand
        sum_pipeline += in_pipeline

    priority_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    rows.sort(key=lambda r: (priority_rank.get(r.priority, 9), -(r.combined_production_needed or 0)))

    summary = ProductionDemandSummaryRead(
        order_demand_total=_round_qty(sum_order_demand),
        order_production_needed=_round_qty(sum_order_need),
        forecast_production_needed=_round_qty(sum_forecast_need),
        combined_production_needed=_round_qty(sum_combined_need),
        on_hand_total=_round_qty(sum_on_hand),
        in_pipeline_total=_round_qty(sum_pipeline),
    )

    return ProductionDemandPlanningRead(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        coverage_days=coverage_days,
        sales_lookback_days=sales_lookback_days,
        coverage_day_presets=list(COVERAGE_DAY_PRESETS),
        summary=summary,
        products=rows,
    )
