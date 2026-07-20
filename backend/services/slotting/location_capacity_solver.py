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


@dataclass
class LocationCapacityResult:
    location_id: int
    location_code: str
    product_id: int
    current_quantity: float
    total_capacity: float
    additional_capacity: float
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

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        d["stacks"] = self.stacks_count
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

    util = min(100.0, (current / total_eff) * 100.0) if total_eff > 0 else 0.0

    return LocationCapacityResult(
        location_id=int(location.id),
        location_code=str(location.name or ""),
        product_id=int(product.id),
        current_quantity=current,
        total_capacity=float(total_eff),
        additional_capacity=float(additional),
        selected_orientation=int(layout_orient),
        count_x=int(cx),
        count_y=int(cy),
        count_z=int(cz),
        stacks_count=int(stacks),
        stacks=int(stacks),
        units_per_stack=int(ups),
        utilization_percent=round(util, 2),
        limiting_factor=limiting,
        method=method.value,
        confidence=confidence.value,
        explanation=explanation,
        warnings=warnings,
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
