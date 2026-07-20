"""Location capacity solver — 1 SKU → space → CapacityResult (fit_engine SSOT)."""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ...models.product import Product
from ..fit_engine.adapters import fit_container_from_location, fit_item_from_product
from ..fit_engine.geometry import (
    best_identical_unit_layout,
    cylinder_identical_capacity,
    item_fits_in_container_any_orientation,
)
from ..fit_engine.models import FitConfidence, FitContainer, FitMethod
from .structural_weight import (
    StructuralWeightBudget,
    apply_weight_budget_to_additional,
    resolve_structural_weight_budget,
)
from .capacity_trust import resolve_trusted_capacity


@dataclass
class LocationCapacityResult:
    location_id: int
    location_code: str
    product_id: int
    current_quantity: float
    total_capacity: Optional[float]
    additional_capacity: Optional[float]
    selected_orientation: int
    count_x: int
    count_y: int
    count_z: int
    stacks_count: int
    stacks: int  # alias for contract clarity
    units_per_stack: int
    utilization_percent: float
    limiting_factor: Optional[str]
    method: str
    confidence: str
    explanation: str
    warnings: list[str]
    used_defaults: bool = False
    defaulted_fields: list[str] | None = None
    weight_budget: Optional[dict[str, Any]] = None
    geometry_source: str = "REAL_DATA"
    capacity_numeric_trusted: bool = True
    computational_additional_capacity: Optional[float] = None
    computational_total_capacity: Optional[float] = None
    planning_additional_capacity: Optional[float] = None

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["stacks"] = self.stacks_count
        d["defaulted_fields"] = list(self.defaulted_fields or [])
        return d


def _sku_qty_at_location(db: Session, *, location_id: int, product_id: int) -> float:
    row = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(Inventory.location_id == int(location_id), Inventory.product_id == int(product_id))
        .scalar()
    )
    return float(row or 0)


def _other_sku_present(db: Session, *, location_id: int, product_id: int) -> bool:
    row = (
        db.query(Inventory.product_id)
        .filter(
            Inventory.location_id == int(location_id),
            Inventory.product_id != int(product_id),
            Inventory.quantity > 0,
        )
        .first()
    )
    return row is not None


def solve_location_capacity(
    db: Session,
    *,
    location: Location,
    product: Product,
    packaging_mode: str = "UNIT",
    weight_budget: Optional[StructuralWeightBudget] = None,
) -> LocationCapacityResult:
    """Current / total / additional capacity for one SKU at a location."""
    item = fit_item_from_product(product, packaging_mode=packaging_mode)
    empty = FitContainer(
        container_id=str(int(location.id)),
        length_cm=float(getattr(location, "depth", None) or 0),
        width_cm=float(getattr(location, "width", None) or 0),
        height_cm=float(getattr(location, "height", None) or 0),
        max_weight_kg=float(mw) if (mw := getattr(location, "max_weight_kg", None)) is not None else None,
        occupied_volume_dm3=0.0,
        occupied_weight_kg=0.0,
        label=str(location.name or ""),
        kind="location",
    )
    current = _sku_qty_at_location(db, location_id=int(location.id), product_id=int(product.id))
    mixed = _other_sku_present(db, location_id=int(location.id), product_id=int(product.id))
    warnings: list[str] = []

    if str(item.shape_type).lower() == "cylinder":
        total_cap = float(cylinder_identical_capacity(empty, item))
        layout_orient = cx = cy = cz = stacks = ups = 0
        method = FitMethod.GEOMETRIC
        confidence = FitConfidence.EXACT
        explanation = f"Cylinder grid: max {int(total_cap)} szt."
        limiting = None
    else:
        layout = best_identical_unit_layout(empty, item)
        total_cap = float(layout.capacity)
        layout_orient = layout.orientation_index
        cx, cy, cz = layout.count_x, layout.count_y, layout.count_z
        stacks, ups = layout.stacks_count, layout.units_per_stack
        method = layout.method
        confidence = layout.confidence
        explanation = layout.explanation
        limiting = layout.limiting_factor

    if mixed:
        rem_vol = max(0.0, empty.volume_dm3 - float(getattr(location, "occupied_volume_dm3", 0) or 0))
        uv = item.unit_volume_dm3
        add_est = float(math.floor(rem_vol / uv)) if uv > 0 and rem_vol > 0 else 0.0
        ok, _ = item_fits_in_container_any_orientation(empty, item)
        if not ok:
            add_est = 0.0
        additional = max(0.0, add_est)
        warnings.append("ESTIMATED_MIXED_SKU: lokalizacja zawiera inne SKU — brak exact geometry.")
        method = FitMethod.ESTIMATED_MIXED_SKU
        confidence = FitConfidence.ESTIMATED
        explanation = (
            f"Szacunkowo można dołożyć ~{int(additional)} szt. (mixed SKU). "
            f"Obecnie {current:g} szt. tego SKU."
        )
        total_eff = current + additional
    else:
        additional = max(0.0, total_cap - current)
        total_eff = total_cap if total_cap > 0 else current + additional
        if current > total_cap + 1e-6 and total_cap > 0:
            warnings.append("Occupancy exceeds theoretical geometric capacity.")
            additional = 0.0
        # Without a placement map we cannot prove existing units match selected orientation.
        if current > 1e-9 and method == FitMethod.GEOMETRIC and confidence == FitConfidence.EXACT:
            confidence = FitConfidence.ESTIMATED
            warnings.append(
                "SAME_SKU_OCCUPANCY_ESTIMATED: existing qty known, physical placement map unknown."
            )

    budget = weight_budget if weight_budget is not None else resolve_structural_weight_budget(db, location)
    # First apply structural weight to geometric additional (computational path).
    geo_additional, limiting, w_warns = apply_weight_budget_to_additional(
        additional=additional,
        unit_weight_kg=float(item.weight_kg or 0),
        budget=budget,
        limiting_factor=limiting,
    )
    warnings.extend(w_warns)
    geo_total = total_eff
    if geo_additional + 1e-9 < (total_eff - current) and not mixed:
        geo_total = current + geo_additional

    trust = resolve_trusted_capacity(
        geometric_additional=geo_additional,
        geometric_total=geo_total,
        current_qty=current,
        defaulted_fields=list(item.defaulted_fields or []),
        unit_weight_kg=float(item.weight_kg or 0),
        weight_remaining_kg=budget.effective_remaining_kg,
        mixed_sku=mixed,
    )
    conf_str = str(trust["capacity_confidence"])
    if (
        not mixed
        and trust["geometry_source"] == "REAL_DATA"
        and conf_str == "EXACT"
        and current > 1e-9
        and method == FitMethod.GEOMETRIC
    ):
        conf_str = FitConfidence.ESTIMATED.value
        warnings.append(
            "SAME_SKU_OCCUPANCY_ESTIMATED: existing qty known, physical placement map unknown."
        )
    if trust.get("limiting_factor_hint") and trust["capacity_numeric_trusted"]:
        limiting = str(trust["limiting_factor_hint"])

    add_out = trust["additional_capacity"]
    total_out = trust["total_capacity"]
    if add_out is not None and total_out is not None and total_out > 0:
        util = min(100.0, (current / float(total_out)) * 100.0)
    else:
        util = 0.0

    if item.used_defaults and "TECHNICAL_LOGISTICS_DEFAULTS" not in warnings:
        warnings.append("TECHNICAL_LOGISTICS_DEFAULTS")

    if trust["geometry_source"] == "FALLBACK":
        explanation = (
            "Pojemność geometryczna nieokreślona (brak wymiarów produktu)."
            if not trust["capacity_numeric_trusted"]
            else f"Pojemność ograniczona wagą (~{int(add_out or 0)} szt.); geometria nieokreślona."
        )

    return LocationCapacityResult(
        location_id=int(location.id),
        location_code=str(location.name or ""),
        product_id=int(product.id),
        current_quantity=current,
        total_capacity=float(total_out) if total_out is not None else None,
        additional_capacity=float(add_out) if add_out is not None else None,
        selected_orientation=int(layout_orient),
        count_x=int(cx),
        count_y=int(cy),
        count_z=int(cz),
        stacks_count=int(stacks),
        stacks=int(stacks),
        units_per_stack=int(ups),
        utilization_percent=round(util, 2),
        limiting_factor=limiting,
        method=method.value if hasattr(method, "value") else str(method),
        confidence=conf_str,
        explanation=explanation,
        warnings=warnings,
        used_defaults=bool(item.used_defaults),
        defaulted_fields=list(item.defaulted_fields or []),
        weight_budget=budget.to_dict(),
        geometry_source=str(trust["geometry_source"]),
        capacity_numeric_trusted=bool(trust["capacity_numeric_trusted"]),
        computational_additional_capacity=float(trust["computational_additional_capacity"] or 0),
        computational_total_capacity=float(trust["computational_total_capacity"] or 0),
        planning_additional_capacity=float(trust["planning_additional_capacity"] or 0)
        if trust["planning_additional_capacity"] is not None
        else None,
    )


def empty_location_geometric_capacity(
    location: Location,
    product: Product,
    *,
    packaging_mode: str = "UNIT",
) -> tuple[float, Optional[str], str, str, str]:
    """
    Geometric max units treating location as empty (for putaway remaining estimates).
    Returns (capacity, limiting_factor, method, confidence, explanation).
    """
    item = fit_item_from_product(product, packaging_mode=packaging_mode)
    container = fit_container_from_location(location)
    empty = FitContainer(
        container_id=container.container_id,
        length_cm=container.length_cm,
        width_cm=container.width_cm,
        height_cm=container.height_cm,
        max_weight_kg=container.max_weight_kg,
        occupied_volume_dm3=0.0,
        occupied_weight_kg=0.0,
        label=container.label,
        kind="location",
    )
    if str(item.shape_type).lower() == "cylinder":
        return float(cylinder_identical_capacity(empty, item)), None, FitMethod.GEOMETRIC.value, FitConfidence.EXACT.value, "cylinder"
    layout = best_identical_unit_layout(empty, item)
    return (
        float(layout.capacity),
        layout.limiting_factor,
        layout.method.value,
        layout.confidence.value,
        layout.explanation,
    )
