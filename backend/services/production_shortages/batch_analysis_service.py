"""Batch-level material analysis helper."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.product_composition import ProductionBatch
from ..production_batch_service import _aggregate_batch_components, ProductionBatchError
from .analysis_service import (
    analyze_component_requirements,
    can_start_with_material_status,
    compute_partial_production,
)
from .block_message_service import build_production_block_message


def analyze_batch_materials(db: Session, *, batch: ProductionBatch) -> dict[str, Any]:
    totals = _aggregate_batch_components(batch)
    total_planned = sum(float(ln.planned_quantity or 0) for ln in batch.lines or []) or 1.0
    per_unit = {int(pid): float(qty) / total_planned for pid, qty in totals.items()}

    components = analyze_component_requirements(
        db,
        tenant_id=int(batch.tenant_id),
        warehouse_id=int(batch.warehouse_id),
        component_totals=totals,
        exclude_batch_id=int(batch.id),
    )
    partial = compute_partial_production(
        planned_quantity=float(total_planned),
        per_unit=per_unit,
        components=components,
    )
    shortages = [c for c in components if float(c.get("missing_qty") or 0) > 1e-6]
    block = build_production_block_message(
        material_status=str(partial["material_status"]),
        planned_quantity=total_planned,
        producible_now_qty=float(partial["producible_now_qty"]),
        waiting_qty=float(partial["waiting_qty"]),
        limiting_component=partial.get("limiting_component"),
        components_with_shortage=shortages,
    )
    return {
        "batch_id": int(batch.id),
        "total_planned_units": total_planned,
        "components": components,
        "can_start_production": can_start_with_material_status(str(partial["material_status"])),
        "block_message": block,
        **partial,
    }


def assert_batch_can_start_collection(db: Session, batch: ProductionBatch) -> dict[str, Any]:
    """Raise only when BLOCKED (zero producible) — partial allowed."""
    analysis = analyze_batch_materials(db, batch=batch)
    if not analysis.get("can_start_production"):
        raise ProductionBatchError(
            str(analysis.get("block_message", {}).get("summary") or "Niewystarczający stan magazynowy składników."),
            code="insufficient_stock",
            shortages=[c for c in analysis.get("components") or [] if float(c.get("missing_qty") or 0) > 1e-6],
        )
    return analysis
