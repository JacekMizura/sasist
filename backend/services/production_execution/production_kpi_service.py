"""Backend-only KPI aggregates for production UI (no client-side reduce/sum)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.product_composition import ProductionBatch
from ...models.production import ProductionOrder
from ..production_batch_service import _batch_has_shortages
from ...schemas.production_recipe_card import (
    ProductionAnalyticsSummaryRead,
    ProductionBatchListSummaryRead,
    ProductionHistorySummaryRead,
)
from .constants import (
    AWAITING_PUTAWAY_BATCH_STATUSES,
    EXECUTING_BATCH_STATUSES,
    PLANNED_BATCH_STATUSES,
    TERMINAL_EXECUTION_STATUSES,
)
from .cost_service import compute_batch_display_unit_cost


def _open_batch_metrics(
    db: Session,
    batches: list[ProductionBatch],
) -> tuple[int, int, int, int, float, float]:
    """planned, active_executing, awaiting_putaway, shortages, units_in_production, total_open."""
    planned = active_executing = awaiting = shortages = 0
    units_in_production = 0.0
    for b in batches:
        status = str(b.status or "")
        if status in PLANNED_BATCH_STATUSES:
            planned += 1
            if _batch_has_shortages(db, b):
                shortages += 1
        if status in EXECUTING_BATCH_STATUSES:
            active_executing += 1
            units_in_production += sum(
                max(0.0, float(ln.planned_quantity or 0) - float(ln.completed_quantity or 0))
                for ln in b.lines or []
            )
        if status in AWAITING_PUTAWAY_BATCH_STATUSES:
            awaiting += 1
    total_open = len(batches)
    return planned, active_executing, awaiting, shortages, round(units_in_production, 4), total_open


def get_open_batch_list_summary(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> ProductionBatchListSummaryRead:
    q = db.query(ProductionBatch).filter(ProductionBatch.tenant_id == int(tenant_id))
    if warehouse_id:
        q = q.filter(ProductionBatch.warehouse_id == int(warehouse_id))
    q = q.filter(ProductionBatch.status.notin_(list(TERMINAL_EXECUTION_STATUSES)))
    batches = q.all()
    planned, active_executing, awaiting, shortages, units_in_production, total_open = _open_batch_metrics(db, batches)
    return ProductionBatchListSummaryRead(
        planned=planned,
        active=active_executing + awaiting,
        awaiting_putaway=awaiting,
        shortages=shortages,
        total_units=round(
            sum(sum(float(ln.planned_quantity or 0) for ln in b.lines or []) for b in batches),
            4,
        ),
        units_in_production=units_in_production,
        total=total_open,
    )


def get_production_history_summary(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> ProductionHistorySummaryRead:
    bq = db.query(ProductionBatch).filter(
        ProductionBatch.tenant_id == int(tenant_id),
        ProductionBatch.status == "completed",
    )
    oq = db.query(ProductionOrder).filter(
        ProductionOrder.tenant_id == int(tenant_id),
        ProductionOrder.status == "completed",
    )
    if warehouse_id:
        bq = bq.filter(ProductionBatch.warehouse_id == int(warehouse_id))
        oq = oq.filter(ProductionOrder.warehouse_id == int(warehouse_id))
    batches = bq.all()
    orders = oq.all()
    units = sum(
        sum(float(ln.completed_quantity or ln.planned_quantity or 0) for ln in b.lines or [])
        for b in batches
    )
    units += sum(float(o.produced_quantity or o.planned_quantity or 0) for o in orders)
    costs: list[float] = []
    for b in batches:
        val = compute_batch_display_unit_cost(b.lines or [])
        if val is not None and val > 0:
            costs.append(val)
    for o in orders:
        if o.calculated_unit_cost is not None and float(o.calculated_unit_cost) > 0:
            costs.append(float(o.calculated_unit_cost))
    avg = round(sum(costs) / len(costs), 4) if costs else None
    return ProductionHistorySummaryRead(
        completed_batches=len(batches) + len(orders),
        units=round(units, 4),
        avg_unit_cost=avg,
    )


def get_production_analytics_summary(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> ProductionAnalyticsSummaryRead:
    from ..production_recipe_card_service import list_recipe_cards

    recipes = list_recipe_cards(db, tenant_id=tenant_id, warehouse_id=warehouse_id, active_only=False)
    with_cost = [r for r in recipes if r.unit_cost_net is not None]
    avg_cost = round(sum(float(r.unit_cost_net or 0) for r in with_cost) / len(with_cost), 4) if with_cost else 0.0
    low_stock = sum(1 for r in recipes if r.has_low_stock)
    active = sum(1 for r in recipes if r.is_active)
    total_producible = sum(int(r.max_producible) for r in recipes)
    material_cost = sum(
        float(r.unit_cost_net or 0) * max(0.0, float(r.current_stock or 0)) for r in recipes
    )
    return ProductionAnalyticsSummaryRead(
        avg_unit_cost=avg_cost,
        low_stock_count=low_stock,
        active_count=active,
        total_producible=total_producible,
        material_cost_sum=round(material_cost, 4),
    )
