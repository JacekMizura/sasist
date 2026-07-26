"""Production plan simulation (no batch creation)."""

from __future__ import annotations

import logging
from collections import Counter
from datetime import date

from sqlalchemy.orm import Session, joinedload

from ...models.product import Product
from ...models.product_composition import ProductComposition
from ...schemas.production_planning import (
    ProductionPlanSimulationDiagnosticsRead,
    ProductionPlanSimulationLineRead,
    ProductionPlanSimulationMaterialRead,
    ProductionPlanSimulationRead,
    ProductionPlanSimulationSkipDetailRead,
)
from ..composition_engine_service import effective_line_qty
from .inventory_coverage_service import coverage_after_production
from .lead_time_service import estimated_completion_date
from .material_availability_service import material_shortages_for_quantity
from .planning_service import PlanningContext, build_planning_snapshot

logger = logging.getLogger(__name__)

# Skip reason codes (stable for UI / logs; MRP filters unchanged)
SKIP_REQUEST_QTY_LE_0 = "request_quantity_le_0"
SKIP_RECOMMENDED_QTY_LE_0 = "recommended_quantity_le_0"
SKIP_MISSING_COMPOSITION_ID = "missing_composition_id"
SKIP_NOT_IN_SNAPSHOT = "product_not_in_planning_snapshot"
SKIP_COMPOSITION_NOT_FOUND = "composition_not_found_in_db"
ACCEPTED = "accepted"

_REASON_PL: dict[str, str] = {
    SKIP_REQUEST_QTY_LE_0: "quantity w request <= 0",
    SKIP_RECOMMENDED_QTY_LE_0: "recommended_quantity <= 0",
    SKIP_MISSING_COMPOSITION_ID: "brak receptury (composition_id)",
    SKIP_NOT_IN_SNAPSHOT: "produkt poza snapshotem planowania (brak aktywnej receptury w MRP)",
    SKIP_COMPOSITION_NOT_FOUND: "receptura nie istnieje w bazie",
    ACCEPTED: "przyjęty do symulacji",
}


def _skip_detail(
    *,
    product_id: int,
    reason_code: str,
    product_name: str | None = None,
    recommended_quantity: float | None = None,
    composition_id: int | None = None,
) -> ProductionPlanSimulationSkipDetailRead:
    return ProductionPlanSimulationSkipDetailRead(
        product_id=product_id,
        product_name=product_name,
        recommended_quantity=recommended_quantity,
        composition_id=composition_id,
        reason_code=reason_code,
        reason=_REASON_PL.get(reason_code, reason_code),
    )


def _build_empty_diagnostics(
    *,
    diag: ProductionPlanSimulationDiagnosticsRead,
) -> ProductionPlanSimulationDiagnosticsRead:
    """Fill empty_reason_* when no lines were simulated. Does not change selection."""
    details: list[str] = []
    skip_counts = diag.skip_counts

    if diag.snapshot_product_count == 0:
        code = "NO_ACTIVE_RECIPES"
        message = "Żaden produkt nie posiada aktywnej receptury."
        details.append("Snapshot planowania jest pusty (brak aktywnych receptur manufacturing).")
    elif diag.input_source == "request_lines" and diag.request_line_count == 0:
        code = "NO_REQUEST_LINES"
        message = "Nie przekazano produktów do symulacji."
        details.append("Body.lines było puste — użyto rekomendacji ze snapshotu.")
        if diag.recommendations_positive_count == 0:
            details.append(
                f"{diag.snapshot_product_count} produktów w planowaniu miało recommended_quantity = 0 "
                f"lub brak dodatniej rekomendacji."
            )
            code = "NO_POSITIVE_RECOMMENDATION"
            message = "Nie znaleziono produktów z dodatnią rekomendacją produkcji."
        elif diag.recommendations_with_recipe_count == 0:
            code = "NO_ACTIVE_RECIPE_ON_RECOMMENDATIONS"
            message = "Żaden produkt z rekomendacją nie posiada aktywnej receptury."
            details.append(
                f"{diag.recommendations_positive_count} produktów miało recommended_quantity > 0, "
                f"ale bez composition_id."
            )
    elif diag.recommendations_positive_count == 0 and diag.input_source == "snapshot_recommendations":
        code = "NO_POSITIVE_RECOMMENDATION"
        message = "Nie znaleziono produktów z dodatnią rekomendacją produkcji."
        details.append(
            f"{diag.snapshot_product_count} produktów w planowaniu — wszystkie z recommended_quantity = 0 "
            f"(brak produktów wymagających produkcji)."
        )
    elif diag.recommendations_with_recipe_count == 0 and diag.input_source == "snapshot_recommendations":
        code = "NO_ACTIVE_RECIPE_ON_RECOMMENDATIONS"
        message = "Żaden produkt z rekomendacją nie posiada aktywnej receptury."
        details.append(
            f"{diag.recommendations_positive_count} produktów miało recommended_quantity > 0, "
            f"ale bez composition_id."
        )
    elif diag.candidates_count == 0:
        code = "NO_CANDIDATES"
        message = "Brak produktów wymagających produkcji."
        details.append("Żaden produkt nie przeszedł wstępnego filtra kandydatów do symulacji.")
    else:
        code = "ALL_CANDIDATES_SKIPPED"
        message = "Wszystkie produkty zostały odfiltrowane przed symulacją."
        details.append(f"Kandydatów: {diag.candidates_count}, przyjętych: 0.")

    for reason_code, count in sorted(skip_counts.items(), key=lambda x: (-x[1], x[0])):
        if reason_code == ACCEPTED or count <= 0:
            continue
        label = _REASON_PL.get(reason_code, reason_code)
        details.append(f"{count}× SKIP: {label} ({reason_code})")

    if not details:
        details.append("Wszystkie produkty zostały odfiltrowane.")

    diag.empty_reason_code = code
    diag.empty_reason_message = message
    diag.empty_reason_details = details
    return diag


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

    snapshot_product_count = len(snap.products)
    recommendations_positive = [
        r for r in snap.products if float(r.recommended_quantity) > 0
    ]
    recommendations_with_recipe = [
        r for r in snap.products if float(r.recommended_quantity) > 0 and r.composition_id
    ]

    request_lines_raw = list(product_quantities) if product_quantities else []
    use_request = bool(product_quantities)
    input_source: str = "request_lines" if use_request else "snapshot_recommendations"

    skips: list[ProductionPlanSimulationSkipDetailRead] = []
    skip_counter: Counter[str] = Counter()

    lines_in: list[dict[str, float | int]] = []

    if use_request:
        for x in request_lines_raw:
            pid = int(x["product_id"])
            qty = float(x.get("quantity") or 0)
            row = row_by_pid.get(pid)
            name = row.product_name if row else None
            if qty <= 0:
                skip_counter[SKIP_REQUEST_QTY_LE_0] += 1
                skips.append(
                    _skip_detail(
                        product_id=pid,
                        reason_code=SKIP_REQUEST_QTY_LE_0,
                        product_name=name,
                        recommended_quantity=qty,
                        composition_id=int(row.composition_id) if row and row.composition_id else None,
                    )
                )
                logger.info(
                    "SKIP product_id=%s recommended_quantity=%s composition_id=%s reason=%s",
                    pid,
                    qty,
                    getattr(row, "composition_id", None) if row else None,
                    SKIP_REQUEST_QTY_LE_0,
                )
                continue
            lines_in.append({"product_id": pid, "quantity": qty})
    else:
        zero_rec_count = 0
        for r in snap.products:
            pid = int(r.product_id)
            qty = float(r.recommended_quantity)
            cid = int(r.composition_id) if r.composition_id else None
            if qty <= 0:
                # Count only — listing every zero-recommendation product floods logs/UI.
                zero_rec_count += 1
                skip_counter[SKIP_RECOMMENDED_QTY_LE_0] += 1
                continue
            if not cid:
                skip_counter[SKIP_MISSING_COMPOSITION_ID] += 1
                skips.append(
                    _skip_detail(
                        product_id=pid,
                        reason_code=SKIP_MISSING_COMPOSITION_ID,
                        product_name=r.product_name,
                        recommended_quantity=qty,
                        composition_id=None,
                    )
                )
                logger.info(
                    "SKIP product_id=%s recommended_quantity=%s composition_id=%s reason=%s",
                    pid,
                    qty,
                    None,
                    SKIP_MISSING_COMPOSITION_ID,
                )
                continue
            lines_in.append({"product_id": pid, "quantity": qty})
        if zero_rec_count:
            logger.info(
                "SKIP summary: %s products with recommended_quantity <= 0 (%s)",
                zero_rec_count,
                SKIP_RECOMMENDED_QTY_LE_0,
            )

    logger.info(
        "simulate_production_plan INPUT tenant_id=%s warehouse_id=%s coverage_days=%s "
        "strategy=%s input_source=%s request_lines=%s snapshot_products=%s "
        "recommendations_positive=%s recommendations_with_recipe=%s candidates=%s lines=%s",
        ctx.tenant_id,
        ctx.warehouse_id,
        snap.coverage_days,
        snap.forecast_strategy,
        input_source,
        len(request_lines_raw),
        snapshot_product_count,
        len(recommendations_positive),
        len(recommendations_with_recipe),
        len(lines_in),
        [{"product_id": int(x["product_id"]), "quantity": float(x["quantity"])} for x in lines_in],
    )

    sim_lines: list[ProductionPlanSimulationLineRead] = []
    material_acc: dict[int, dict[str, float]] = {}
    still_critical = 0
    completion_dates: list[date] = []

    for ln in lines_in:
        pid = int(ln["product_id"])
        qty = float(ln["quantity"])
        row = row_by_pid.get(pid)
        if row is None:
            skip_counter[SKIP_NOT_IN_SNAPSHOT] += 1
            skips.append(
                _skip_detail(
                    product_id=pid,
                    reason_code=SKIP_NOT_IN_SNAPSHOT,
                    recommended_quantity=qty,
                )
            )
            logger.info(
                "SKIP product_id=%s recommended_quantity=%s composition_id=%s reason=%s",
                pid,
                qty,
                None,
                SKIP_NOT_IN_SNAPSHOT,
            )
            continue
        if not row.composition_id:
            skip_counter[SKIP_MISSING_COMPOSITION_ID] += 1
            skips.append(
                _skip_detail(
                    product_id=pid,
                    reason_code=SKIP_MISSING_COMPOSITION_ID,
                    product_name=row.product_name,
                    recommended_quantity=qty,
                    composition_id=None,
                )
            )
            logger.info(
                "SKIP product_id=%s recommended_quantity=%s composition_id=%s reason=%s",
                pid,
                qty,
                None,
                SKIP_MISSING_COMPOSITION_ID,
            )
            continue

        comp = (
            db.query(ProductComposition)
            .options(joinedload(ProductComposition.lines))
            .filter(ProductComposition.id == int(row.composition_id))
            .first()
        )
        if comp is None:
            skip_counter[SKIP_COMPOSITION_NOT_FOUND] += 1
            skips.append(
                _skip_detail(
                    product_id=pid,
                    reason_code=SKIP_COMPOSITION_NOT_FOUND,
                    product_name=row.product_name,
                    recommended_quantity=qty,
                    composition_id=int(row.composition_id),
                )
            )
            logger.info(
                "SKIP product_id=%s recommended_quantity=%s composition_id=%s reason=%s",
                pid,
                qty,
                int(row.composition_id),
                SKIP_COMPOSITION_NOT_FOUND,
            )
            continue

        # Same MRP path as before — material shortages do not exclude the line.
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

        skip_counter[ACCEPTED] += 1
        logger.info(
            "ACCEPT product_id=%s recommended_quantity=%s composition_id=%s simulated_quantity=%s",
            pid,
            qty,
            int(row.composition_id),
            round(capped, 2),
        )

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

    diagnostics = ProductionPlanSimulationDiagnosticsRead(
        input_source=input_source,  # type: ignore[arg-type]
        warehouse_id=int(ctx.warehouse_id),
        tenant_id=int(ctx.tenant_id),
        coverage_days=int(snap.coverage_days),
        forecast_strategy=str(snap.forecast_strategy),
        snapshot_product_count=snapshot_product_count,
        request_line_count=len(request_lines_raw),
        recommendations_positive_count=len(recommendations_positive),
        recommendations_with_recipe_count=len(recommendations_with_recipe),
        candidates_count=len(lines_in),
        accepted_count=len(sim_lines),
        skip_counts=dict(skip_counter),
        skips=skips[:200],
    )

    if not sim_lines:
        diagnostics = _build_empty_diagnostics(diag=diagnostics)
        logger.info(
            "Symulacja zakończona. 0 produktów do symulacji. code=%s message=%s details=%s",
            diagnostics.empty_reason_code,
            diagnostics.empty_reason_message,
            diagnostics.empty_reason_details,
        )
    else:
        logger.info(
            "Symulacja zakończona. accepted=%s total_qty=%s materials=%s",
            len(sim_lines),
            round(sum(l.simulated_quantity for l in sim_lines), 2),
            len(materials),
        )

    return ProductionPlanSimulationRead(
        tenant_id=ctx.tenant_id,
        warehouse_id=ctx.warehouse_id,
        coverage_days=snap.coverage_days,
        forecast_strategy=snap.forecast_strategy,
        lines=sim_lines,
        materials=materials,
        products_still_critical=still_critical,
        estimated_completion_date=max_completion,
        total_simulated_quantity=round(sum(l.simulated_quantity for l in sim_lines), 2),
        diagnostics=diagnostics,
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
