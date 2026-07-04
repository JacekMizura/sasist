"""PlanningService — commercial MRP orchestrator."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductComposition
from ...schemas.production_planning import (
    ProductionDemandPlanningRead,
    ProductionDemandProductRowRead,
    ProductionPlanningDashboardRead,
)
from ..product_inventory_snapshot_service import inventory_snapshots_for_products
from ..production_recipe_card_service import list_recipe_cards
from .constants import (
    COVERAGE_DAY_PRESETS,
    DEFAULT_COVERAGE_DAYS,
    MAX_COVERAGE_DAYS,
    MIN_COVERAGE_DAYS,
)
from .forecast_settings_service import load_forecast_settings
from .forecast_strategies import get_forecast_strategy, list_forecast_strategies
from .inventory_coverage_service import coverage_color, coverage_days
from .lead_time_service import lead_time_days
from .material_availability_service import cap_by_materials, max_producible_by_product
from .order_demand_service import order_demand_by_product
from .pipeline_service import total_pipeline_qty_by_product
from .priority_engine import compute_priority
from .production_recommendation_service import (
    apply_moq_and_multiple,
    combined_production_need,
    forecast_stock_need,
    forecast_target_stock,
    product_batch_multiple,
    product_max_stock,
    product_min_stock,
    product_moq,
)
from .recommendation_reason_service import build_recommendation_reasons
from .sales_history_service import bulk_daily_sales_series
from .timeline_service import build_stock_timeline
from ..production_shortages.analysis_service import analyze_composition_quantity
from ..production_shortages.constants import STATUS_BLOCKED


@dataclass(frozen=True)
class PlanningContext:
    tenant_id: int
    warehouse_id: int
    coverage_days: int = DEFAULT_COVERAGE_DAYS
    forecast_strategy: str | None = None
    sales_lookback_days: int | None = None


def _clamp_coverage(value: int) -> int:
    return max(MIN_COVERAGE_DAYS, min(MAX_COVERAGE_DAYS, int(value)))


def _round_qty(v: float) -> float:
    return round(max(0.0, float(v)), 2)


def build_planning_snapshot(db: Session, ctx: PlanningContext) -> ProductionDemandPlanningRead:
    coverage_days_val = _clamp_coverage(ctx.coverage_days)
    settings = load_forecast_settings(db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id)
    strategy_key = ctx.forecast_strategy or settings.strategy
    lookback = ctx.sales_lookback_days or settings.sales_lookback_days
    strategy = get_forecast_strategy(strategy_key)

    recipes = list_recipe_cards(db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, active_only=True)
    product_ids = [int(r.product_id) for r in recipes]
    composition_by_product = {int(r.product_id): int(r.composition_id) for r in recipes}

    if not product_ids:
        return ProductionDemandPlanningRead(
            tenant_id=ctx.tenant_id,
            warehouse_id=ctx.warehouse_id,
            coverage_days=coverage_days_val,
            sales_lookback_days=lookback,
            forecast_strategy=strategy.key,
            forecast_strategy_label=strategy.label,
            coverage_day_presets=list(COVERAGE_DAY_PRESETS),
            forecast_strategies=list_forecast_strategies(),
            dashboard=ProductionPlanningDashboardRead(),
            products=[],
        )

    order_map = order_demand_by_product(
        db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, product_ids=product_ids
    )
    history_map = bulk_daily_sales_series(
        db,
        tenant_id=ctx.tenant_id,
        warehouse_id=ctx.warehouse_id,
        product_ids=product_ids,
        lookback_days=lookback,
    )
    pipeline_map = total_pipeline_qty_by_product(
        db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, product_ids=product_ids
    )
    inv_map = inventory_snapshots_for_products(
        db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, product_ids=product_ids
    )
    comp_ids = [composition_by_product[pid] for pid in product_ids if pid in composition_by_product]
    max_prod_map = max_producible_by_product(
        db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, composition_ids=comp_ids
    )

    comp_ids_unique = list({int(v) for v in composition_by_product.values()})
    compositions: dict[int, ProductComposition] = {}
    if comp_ids_unique:
        compositions = {
            int(c.id): c
            for c in db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(
                ProductComposition.id.in_(tuple(comp_ids_unique)),
                ProductComposition.tenant_id == int(ctx.tenant_id),
            )
            .all()
        }

    products_db = {
        int(p.id): p
        for p in db.query(Product).filter(Product.id.in_(tuple(product_ids)), Product.tenant_id == int(ctx.tenant_id)).all()
    }

    rows: list[ProductionDemandProductRowRead] = []
    critical_count = 0
    material_blocked = 0
    coverage_sum = 0.0
    coverage_count = 0
    recommended_total = 0.0
    order_demand_total = 0.0

    for recipe in recipes:
        pid = int(recipe.product_id)
        p = products_db.get(pid)
        order_demand = float(order_map.get(pid, 0.0))
        history = history_map.get(pid, [])
        daily_rate = strategy.daily_rate(history)
        on_hand = float(inv_map.get(pid, {}).get("on_hand", 0.0) or 0.0)
        in_pipeline = float(pipeline_map.get(pid, 0.0))
        min_s = product_min_stock(p) if p else None
        max_s = product_max_stock(p) if p else None
        moq = product_moq(p) if p else None
        mult = product_batch_multiple(p) if p else None
        lt = lead_time_days(p) if p else 0
        max_prod = float(max_prod_map.get(pid, 0.0))

        target = forecast_target_stock(
            daily_rate=daily_rate,
            coverage_days=coverage_days_val,
            min_stock=min_s,
            max_stock=max_s,
        )
        forecast_need = forecast_stock_need(
            daily_rate=daily_rate,
            coverage_days=coverage_days_val,
            min_stock=min_s,
            max_stock=max_s,
            on_hand=on_hand,
            in_pipeline=in_pipeline,
        )
        order_need = max(0.0, order_demand - on_hand - in_pipeline)
        combined_raw = combined_production_need(
            order_demand=order_demand,
            forecast_need=forecast_need,
            on_hand=on_hand,
            in_pipeline=in_pipeline,
        )
        recommended = apply_moq_and_multiple(combined_raw, moq, mult)
        recommended = cap_by_materials(recommended, max_prod)

        cov = coverage_days(on_hand=on_hand, avg_daily=daily_rate)
        if cov is not None:
            coverage_sum += cov
            coverage_count += 1

        priority = compute_priority(
            order_demand=order_demand,
            on_hand=on_hand,
            in_pipeline=in_pipeline,
            coverage_days_value=cov,
            lead_time=lt,
            recommended_qty=recommended,
        )
        if priority == "CRITICAL":
            critical_count += 1

        comp_id = composition_by_product.get(pid)
        comp = compositions.get(int(comp_id)) if comp_id else None
        material_status = "OK"
        producible_now = _round_qty(recommended)
        waiting_qty = 0.0
        if recommended > 1e-6 and comp is not None:
            analysis = analyze_composition_quantity(
                db,
                tenant_id=ctx.tenant_id,
                warehouse_id=ctx.warehouse_id,
                composition=comp,
                planned_quantity=float(recommended),
            )
            material_status = str(analysis.get("material_status") or "OK")
            producible_now = _round_qty(float(analysis.get("producible_now_qty") or 0))
            waiting_qty = _round_qty(float(analysis.get("waiting_qty") or 0))
        elif recommended > 1e-6 and max_prod <= 1e-6:
            material_status = STATUS_BLOCKED
            producible_now = 0.0
            waiting_qty = _round_qty(recommended)

        if material_status != "OK":
            material_blocked += 1

        reasons = build_recommendation_reasons(
            product=p,
            order_demand=order_demand,
            on_hand=on_hand,
            in_pipeline=in_pipeline,
            coverage_days_value=cov,
            lead_time=lt,
            daily_rate=daily_rate,
            recommended_qty=recommended,
            forecast_target=target,
        )

        timeline = build_stock_timeline(
            on_hand=on_hand,
            in_pipeline=in_pipeline,
            daily_rate=daily_rate,
            lead_time_days=lt,
            recommended_qty=recommended,
        )

        rows.append(
            ProductionDemandProductRowRead(
                product_id=pid,
                composition_id=composition_by_product.get(pid),
                product_name=str(recipe.product_name),
                product_sku=recipe.product_sku,
                product_image_url=recipe.product_image_url,
                on_hand=_round_qty(on_hand),
                avg_daily_sales=round(daily_rate, 4),
                coverage_days=round(cov, 1) if cov is not None else None,
                coverage_color=coverage_color(cov),
                in_pipeline=_round_qty(in_pipeline),
                order_demand=_round_qty(order_demand),
                forecast_demand=_round_qty(target),
                forecast_production_needed=_round_qty(forecast_need),
                order_production_needed=_round_qty(order_need),
                min_stock=_round_qty(min_s) if min_s else None,
                max_stock=_round_qty(max_s) if max_s else None,
                production_moq=_round_qty(moq) if moq else None,
                production_batch_multiple=_round_qty(mult) if mult else None,
                production_lead_time_days=lt,
                max_producible=_round_qty(max_prod),
                material_status=material_status,  # type: ignore[arg-type]
                producible_now_qty=producible_now,
                waiting_qty=waiting_qty,
                recommended_quantity=_round_qty(recommended),
                combined_production_needed=_round_qty(recommended),
                priority=priority,
                recommendation_reasons=reasons,
                timeline=timeline,
            )
        )
        recommended_total += recommended
        order_demand_total += order_demand

    priority_rank = {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2, "LOW": 3}
    rows.sort(key=lambda r: (priority_rank.get(r.priority, 9), -(r.recommended_quantity or 0)))

    dashboard = ProductionPlanningDashboardRead(
        critical_products=critical_count,
        production_needed_today=sum(1 for r in rows if r.recommended_quantity > 0),
        material_shortage_products=material_blocked,
        total_recommended_quantity=_round_qty(recommended_total),
        average_coverage_days=round(coverage_sum / coverage_count, 1) if coverage_count else None,
        order_demand_total=_round_qty(order_demand_total),
    )

    return ProductionDemandPlanningRead(
        tenant_id=ctx.tenant_id,
        warehouse_id=ctx.warehouse_id,
        coverage_days=coverage_days_val,
        sales_lookback_days=lookback,
        forecast_strategy=strategy.key,
        forecast_strategy_label=strategy.label,
        coverage_day_presets=list(COVERAGE_DAY_PRESETS),
        forecast_strategies=list_forecast_strategies(),
        dashboard=dashboard,
        products=rows,
    )


def get_production_demand_planning(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    coverage_days: int = DEFAULT_COVERAGE_DAYS,
    sales_lookback_days: int | None = None,
    forecast_strategy: str | None = None,
) -> ProductionDemandPlanningRead:
    ctx = PlanningContext(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        coverage_days=int(coverage_days),
        forecast_strategy=forecast_strategy,
        sales_lookback_days=sales_lookback_days,
    )
    return build_planning_snapshot(db, ctx)
