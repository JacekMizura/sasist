"""Production plan simulation (no batch creation)."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductComposition
from ...schemas.production_planning import (
    ProductionPlanSimulationLineRead,
    ProductionPlanSimulationMaterialRead,
    ProductionPlanSimulationRead,
)
from ..composition_engine_service import effective_line_qty
from .inventory_coverage_service import coverage_after_production
from .lead_time_service import estimated_completion_date, lead_time_days
from .material_availability_service import material_shortages_for_quantity
from .planning_service import PlanningContext, build_planning_snapshot


def simulate_production_plan(
    db: Session,
    ctx: PlanningContext,
    *,
    product_quantities: list[dict[str, float | int]] | None = None,
) -> ProductionPlanSimulationRead:
    """
    Simulate production without creating batches.

    product_quantities: optional override [{product_id, quantity}]; default = recommended qty > 0.
    """
    snap = build_planning_snapshot(db, ctx)
    row_by_pid = {int(r.product_id): r for r in snap.products}

    if product_quantities:
        lines_in = [
            {"product_id": int(x["product_id"]), "quantity": float(x["quantity"])}
            for x in product_quantities
            if float(x.get("quantity") or 0) > 0
        ]
    else:
        lines_in = [
            {"product_id": int(r.product_id), "quantity": float(r.recommended_quantity)}
            for r in snap.products
            if float(r.recommended_quantity) > 0 and r.composition_id
        ]

    sim_lines: list[ProductionPlanSimulationLineRead] = []
    material_acc: dict[int, dict[str, float]] = {}
    still_critical = 0
    completion_dates: list[date] = []

    for ln in lines_in:
        pid = int(ln["product_id"])
        qty = float(ln["quantity"])
        row = row_by_pid.get(pid)
        if row is None or not row.composition_id:
            continue

        comp = (
            db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(ProductComposition.id == int(row.composition_id))
            .first()
        )
        if comp is None:
            continue

        shortages = material_shortages_for_quantity(
            db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, composition=comp, quantity=qty
        )
        capped = min(qty, float(row.max_producible)) if row.max_producible > 0 else qty

        yld = float(comp.yield_quantity or 1) or 1.0
        for bl in comp.lines or []:
            per = effective_line_qty(bl, yield_qty=yld)
            cid = int(bl.component_product_id)
            need = per * capped
            if cid not in material_acc:
                material_acc[cid] = {"required": 0.0, "available": 0.0}
            material_acc[cid]["required"] += need

        lt = int(row.production_lead_time_days or 0)
        after_cov = coverage_after_production(
            on_hand=float(row.on_hand),
            in_pipeline=float(row.in_pipeline),
            production_qty=capped,
            avg_daily=float(row.avg_daily_sales),
            lead_time_days=lt,
        )
        after_stock = max(
            0.0,
            float(row.on_hand) + float(row.in_pipeline) + capped - float(row.avg_daily_sales) * lt,
        )
        completion = estimated_completion_date(lead_time=lt)
        completion_dates.append(completion)

        if row.priority == "CRITICAL" and after_cov is not None and after_cov < 7:
            still_critical += 1
        elif capped < qty - 1e-6:
            still_critical += 1

        sim_lines.append(
            ProductionPlanSimulationLineRead(
                product_id=pid,
                product_name=row.product_name,
                requested_quantity=round(qty, 2),
                simulated_quantity=round(capped, 2),
                composition_id=int(row.composition_id),
                material_shortages=[{**s} for s in shortages],
                projected_on_hand=round(after_stock, 2),
                projected_coverage_days=round(after_cov, 1) if after_cov is not None else None,
                estimated_completion_date=completion.isoformat(),
                remains_critical=bool(
                    row.priority == "CRITICAL" and (after_cov is None or after_cov < 7 or capped < qty - 1e-6)
                ),
            )
        )

    # Resolve material availability for aggregated consumption
    materials: list[ProductionPlanSimulationMaterialRead] = []
    if material_acc:
        comp_ids = list(material_acc.keys())
        prods = db.query(Product).filter(Product.id.in_(tuple(comp_ids))).all()
        names = {int(p.id): str(p.name or f"#{p.id}") for p in prods}
        for cid, agg in material_acc.items():
            from ..production_recipe_card_service import _warehouse_stock

            avail = _warehouse_stock(db, tenant_id=ctx.tenant_id, warehouse_id=ctx.warehouse_id, product_id=cid)
            req = float(agg["required"])
            materials.append(
                ProductionPlanSimulationMaterialRead(
                    component_product_id=cid,
                    component_name=names.get(cid, f"#{cid}"),
                    required_total=round(req, 2),
                    available=round(avail, 2),
                    shortage=round(max(0.0, req - avail), 2),
                )
            )

    max_completion = max(completion_dates).isoformat() if completion_dates else None

    return ProductionPlanSimulationRead(
        tenant_id=ctx.tenant_id,
        warehouse_id=ctx.warehouse_id,
        coverage_days=ctx.coverage_days,
        forecast_strategy=ctx.forecast_strategy,
        lines=sim_lines,
        materials=materials,
        products_still_critical=still_critical,
        estimated_completion_date=max_completion,
        total_simulated_quantity=round(sum(l.simulated_quantity for l in sim_lines), 2),
    )


def create_batches_from_simulation(
    db: Session,
    ctx: PlanningContext,
    *,
    performed_by_user_id: int | None = None,
) -> list[int]:
    """Create one multi-product batch from recommended / simulated quantities."""
    from ..production_batch_service import create_batch
    from ...schemas.production_batch import ProductionBatchCreateBody, ProductionBatchLineWrite

    sim = simulate_production_plan(db, ctx)
    batch_lines = [
        ProductionBatchLineWrite(
            product_id=int(l.product_id),
            composition_id=int(l.composition_id),
            planned_quantity=float(l.simulated_quantity),
        )
        for l in sim.lines
        if l.simulated_quantity > 0 and l.composition_id
    ]
    if not batch_lines:
        raise ValueError("Brak pozycji do utworzenia partii.")
    body = ProductionBatchCreateBody(warehouse_id=int(ctx.warehouse_id), status="planned", lines=batch_lines)
    batch = create_batch(
        db,
        tenant_id=int(ctx.tenant_id),
        body=body,
        created_by_user_id=performed_by_user_id,
    )
    return [int(batch.id)]
