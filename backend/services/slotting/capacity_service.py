"""Location capacity — thin adapter over shared fit_engine (SSOT for XYZ/stack/weight)."""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.product import Product
from ..fit_engine.adapters import fit_container_from_location, fit_item_from_product
from ..fit_engine.geometry import best_identical_unit_layout, cylinder_identical_capacity
from ..fit_engine.models import FitContainer, FitItem, FitMethod, OrientationMode, StackingMode
from ..fit_engine.orientations import normalize_orientation_mode
from ..fit_engine.stacking import normalize_stacking_mode
from .constraint_service import normalize_orientation, normalize_stacking
from .errors import LocationNotFoundError, ProductNotFoundError
from .slotting_models import (
    DEFAULT_WEIGHT_KG_PER_DM3,
    MIN_USABLE_VOLUME_DM3,
    ORIENTATION_UPRIGHT_ONLY,
    PACKAGING_CARTON,
    PACKAGING_UNIT,
    STACKING_PALLET_ONLY,
    CapacityCalculationResult,
    LocationCapacityProfile,
    ProductFootprint,
)


def cm3_to_dm3(cm3: float) -> float:
    return float(cm3) / 1000.0


def location_volume_capacity_dm3(loc: Location) -> float:
    w = float(loc.width or 0)
    d = float(loc.depth or 0)
    h = float(loc.height or 0)
    if w > 0 and d > 0 and h > 0:
        return cm3_to_dm3(w * d * h)
    return 0.0


def location_max_weight_kg(loc: Location) -> float:
    explicit = getattr(loc, "max_weight_kg", None)
    if explicit is not None and float(explicit) > 0:
        return float(explicit)
    vol = location_volume_capacity_dm3(loc)
    if vol > 0:
        return vol * DEFAULT_WEIGHT_KG_PER_DM3
    return 0.0


def product_footprint_from_orm(product: Product, *, packaging_mode: str = PACKAGING_UNIT) -> ProductFootprint:
    use_carton = str(packaging_mode or PACKAGING_UNIT).upper() == PACKAGING_CARTON
    if use_carton and float(product.units_per_carton or 0) > 0:
        length = float(product.carton_length_cm or product.length or 0)
        width = float(product.carton_width_cm or product.width or 0)
        height = float(product.carton_height_cm or product.height or 0)
        weight = float(product.carton_weight_kg or product.weight or 0)
        vol = float(product.carton_volume_dm3 or 0)
        orient_raw = getattr(product, "carton_orientation_type", None) or product.orientation_type
        stack_raw = getattr(product, "carton_stack_behavior", None) or product.stack_behavior
        max_stack = getattr(product, "carton_max_stack_weight", None) or product.max_stack_weight
        units_per = float(product.units_per_carton or 1)
        compressible = bool(getattr(product, "carton_stack_compressible", None) or product.stack_compressible)
        max_sc = getattr(product, "carton_max_stack_count", None) or getattr(product, "max_stack_count", None)
        compressed_h = getattr(product, "carton_compressed_height_cm", None) or getattr(
            product, "compressed_height_cm", None
        )
    else:
        length = float(product.length or 0)
        width = float(product.width or 0)
        height = float(product.height or 0)
        weight = float(product.weight or 0)
        vol = float(product.volume or 0)
        orient_raw = product.orientation_type
        stack_raw = product.stack_behavior
        max_stack = product.max_stack_weight
        units_per = 1.0
        compressible = bool(product.stack_compressible)
        max_sc = getattr(product, "max_stack_count", None)
        compressed_h = getattr(product, "compressed_height_cm", None)

    if vol <= 0 and length > 0 and width > 0 and height > 0:
        vol = cm3_to_dm3(length * width * height)
    if weight <= 0:
        weight = vol * DEFAULT_WEIGHT_KG_PER_DM3 * 0.1 if vol > 0 else 0.01

    return ProductFootprint(
        product_id=int(product.id),
        length_cm=length,
        width_cm=width,
        height_cm=height,
        weight_kg=weight,
        volume_dm3=max(vol, MIN_USABLE_VOLUME_DM3) if vol > 0 else vol,
        orientation=normalize_orientation(orient_raw),
        stacking_mode=normalize_stacking(stack_raw, packaging_carton=use_carton),
        compressible=compressible,
        max_stack_weight_kg=float(max_stack) if max_stack is not None else None,
        units_per_carton=units_per,
        max_stack_count=int(max_sc) if max_sc is not None else None,
        compressed_height_cm=float(compressed_h) if compressed_h is not None else None,
    )


def location_profile_from_orm(loc: Location) -> LocationCapacityProfile:
    total_vol = location_volume_capacity_dm3(loc)
    total_w = location_max_weight_kg(loc)
    occ_vol = float(getattr(loc, "occupied_volume_dm3", 0) or 0)
    occ_w = float(getattr(loc, "occupied_weight_kg", 0) or 0)
    util = float(getattr(loc, "capacity_utilization_percent", 0) or 0)
    if util <= 0 and total_vol > 0:
        util = min(100.0, (occ_vol / total_vol) * 100.0)
    return LocationCapacityProfile(
        location_id=int(loc.id),
        location_code=str(loc.name or ""),
        warehouse_id=int(loc.warehouse_id),
        total_volume_dm3=total_vol,
        total_weight_kg=total_w,
        occupied_volume_dm3=occ_vol,
        occupied_weight_kg=occ_w,
        utilization_percent=util,
        operational_zone=getattr(loc, "operational_zone_type", None),
        picking_priority=int(getattr(loc, "picking_priority", 100) or 100),
        pick_sequence=getattr(loc, "pick_sequence", None),
        location_type=str(getattr(loc, "type", "pick") or "pick"),
        length_cm=float(getattr(loc, "depth", None) or 0),
        width_cm=float(getattr(loc, "width", None) or 0),
        height_cm=float(getattr(loc, "height", None) or 0),
    )


def _footprint_to_fit_item(fp: ProductFootprint) -> FitItem:
    orient = normalize_orientation_mode(fp.orientation)
    # Map slotting orientation constants
    o = str(fp.orientation or "").upper()
    if o in ("UPRIGHT_ONLY", "UPRIGHT"):
        orient = OrientationMode.UPRIGHT_ONLY
    elif o in ("NO_ROTATION",):
        orient = OrientationMode.NO_ROTATION
    elif o in ("ANY",):
        orient = OrientationMode.ANY

    stack = normalize_stacking_mode(fp.stacking_mode)
    sm = str(fp.stacking_mode or "").upper()
    if sm in ("NONE", "NO_STACK", "NOT_STACKABLE"):
        stack = StackingMode.NO_STACK
    elif sm == "PALLET_ONLY":
        stack = StackingMode.NO_STACK  # side-by-side only unless carton mode handled upstream

    return FitItem(
        product_id=int(fp.product_id),
        length_cm=float(fp.length_cm or 0),
        width_cm=float(fp.width_cm or 0),
        height_cm=float(fp.height_cm or 0),
        weight_kg=float(fp.weight_kg or 0),
        volume_dm3=float(fp.volume_dm3 or 0),
        orientation=orient,
        stacking=stack,
        compressible=bool(fp.compressible),
        compressed_height_cm=getattr(fp, "compressed_height_cm", None),
        max_stack_count=getattr(fp, "max_stack_count", None),
        max_stack_weight_kg=fp.max_stack_weight_kg,
    )


def _container_from_inputs(
    location: Location | LocationCapacityProfile,
) -> FitContainer:
    if isinstance(location, LocationCapacityProfile):
        L = float(getattr(location, "length_cm", 0) or 0)
        W = float(getattr(location, "width_cm", 0) or 0)
        H = float(getattr(location, "height_cm", 0) or 0)
        return FitContainer(
            container_id=str(int(location.location_id)),
            length_cm=L,
            width_cm=W,
            height_cm=H,
            max_weight_kg=float(location.total_weight_kg) if location.total_weight_kg > 0 else None,
            occupied_volume_dm3=float(location.occupied_volume_dm3 or 0),
            occupied_weight_kg=float(location.occupied_weight_kg or 0),
            label=str(location.location_code or ""),
            kind="location",
        )
    # Location ORM or duck-typed test doubles (width/depth/height)
    return fit_container_from_location(location)


def calculate_location_capacity(
    location: Location | LocationCapacityProfile,
    product: Product | ProductFootprint,
    quantity: float,
    packaging_mode: str = PACKAGING_UNIT,
) -> CapacityCalculationResult:
    """Determine fit / max units using shared fit_engine geometry (not volume-only)."""
    profile = location if isinstance(location, LocationCapacityProfile) else location_profile_from_orm(location)
    footprint = (
        product
        if isinstance(product, ProductFootprint)
        else product_footprint_from_orm(product, packaging_mode=packaging_mode)
    )
    use_carton = str(packaging_mode or PACKAGING_UNIT).upper() == PACKAGING_CARTON
    req_qty = max(0.0, float(quantity or 0))

    rem_vol = max(0.0, profile.total_volume_dm3 - profile.occupied_volume_dm3)
    rem_weight = max(0.0, profile.total_weight_kg - profile.occupied_weight_kg)

    # BC: unknown space → do not block putaway
    if profile.total_volume_dm3 <= 0 and profile.total_weight_kg <= 0:
        return CapacityCalculationResult(
            fits=True,
            max_units=req_qty if req_qty > 0 else 999999,
            max_cartons=req_qty if use_carton else 0,
            remaining_units=999999,
            remaining_volume_dm3=0,
            remaining_weight_kg=0,
            volume_utilization_percent=profile.utilization_percent,
            weight_utilization_percent=0,
            failure_reason=None,
            limiting_factor=None,
            method=FitMethod.UNKNOWN.value,
            confidence="UNKNOWN",
            explanation="Brak wymiarów lokalizacji — capacity unbounded.",
        )

    # Pallet-only products in UNIT mode: reject (domain rule preserved)
    stack_mode = normalize_stacking(footprint.stacking_mode, packaging_carton=use_carton)
    if stack_mode == STACKING_PALLET_ONLY and not use_carton:
        return CapacityCalculationResult(
            fits=False,
            max_units=0,
            max_cartons=0,
            remaining_units=0,
            remaining_volume_dm3=rem_vol,
            remaining_weight_kg=rem_weight,
            volume_utilization_percent=profile.utilization_percent,
            weight_utilization_percent=0,
            failure_reason="Pallet-only stacking — use carton packaging mode",
            limiting_factor="stacking",
            method=FitMethod.GEOMETRIC.value,
            confidence="EXACT",
            explanation="Tryb UNIT niedozwolony dla produktów pallet-only.",
        )

    if normalize_orientation(footprint.orientation) == ORIENTATION_UPRIGHT_ONLY and float(footprint.height_cm or 0) <= 0:
        return CapacityCalculationResult(
            fits=False,
            max_units=0,
            max_cartons=0,
            remaining_units=0,
            remaining_volume_dm3=rem_vol,
            remaining_weight_kg=rem_weight,
            volume_utilization_percent=profile.utilization_percent,
            weight_utilization_percent=0,
            failure_reason="Orientation incompatible: missing product height",
            limiting_factor="orientation",
            method=FitMethod.UNKNOWN.value,
            confidence="UNKNOWN",
            explanation="UPRIGHT_ONLY bez wysokości produktu.",
        )

    item = _footprint_to_fit_item(footprint)
    if isinstance(product, Product) and not isinstance(product, ProductFootprint):
        item = fit_item_from_product(product, packaging_mode=packaging_mode)

    container = _container_from_inputs(location)
    empty = FitContainer(
        container_id=container.container_id,
        length_cm=container.length_cm,
        width_cm=container.width_cm,
        height_cm=container.height_cm,
        max_weight_kg=container.max_weight_kg if container.max_weight_kg else (profile.total_weight_kg or None),
        occupied_volume_dm3=0.0,
        occupied_weight_kg=0.0,
        label=container.label,
        kind="location",
    )

    if str(getattr(item, "shape_type", "box")).lower() == "cylinder":
        empty_cap = float(cylinder_identical_capacity(empty, item))
        limiting = None
        method = FitMethod.GEOMETRIC.value
        confidence = "EXACT"
        explanation = f"Cylinder: max {int(empty_cap)} szt. w pustej lokalizacji."
    else:
        layout = best_identical_unit_layout(empty, item)
        empty_cap = float(layout.capacity)
        limiting = layout.limiting_factor
        method = layout.method.value
        confidence = layout.confidence.value
        explanation = layout.explanation

    # Occupancy-aware remaining (without placement map): estimate used units from volume
    unit_vol = item.unit_volume_dm3 or float(footprint.volume_dm3 or 0)
    if profile.occupied_volume_dm3 > 1e-9 and unit_vol > 0 and empty_cap > 0:
        used_est = math.floor(float(profile.occupied_volume_dm3) / unit_vol)
        max_units = max(0.0, empty_cap - used_est)
        if profile.occupied_volume_dm3 > 0:
            method = FitMethod.VOLUME_ESTIMATE.value if method == FitMethod.GEOMETRIC.value else method
            confidence = "ESTIMATED" if confidence == "EXACT" else confidence
            explanation = (
                f"{explanation} Po zajętości objętościowej (~{used_est} szt.): "
                f"pozostało ~{int(max_units)} szt."
            )
    else:
        max_units = empty_cap

    # Remaining weight hard cap (always)
    unit_weight = float(item.weight_kg or footprint.weight_kg or 0)
    if unit_weight > 0 and rem_weight > 0:
        by_w = math.floor(rem_weight / unit_weight)
        if by_w < max_units:
            max_units = float(by_w)
            limiting = "weight"
            explanation = f"{explanation} Limit wagi lokalizacji: {by_w} szt."
    elif unit_weight > 0 and profile.total_weight_kg > 0 and rem_weight <= 0:
        max_units = 0.0
        limiting = "weight"

    max_units = max(0.0, float(math.floor(max_units * 10000) / 10000))

    fits = req_qty <= 0 or max_units + 1e-9 >= req_qty
    failure = None
    if not fits:
        if limiting == "weight":
            failure = "Location exceeds weight limit"
        elif limiting in ("geometry", "max_stack_count", None):
            failure = "Insufficient remaining volume" if rem_vol < (req_qty * unit_vol if unit_vol else 0) else "Capacity exceeded"
        else:
            failure = "Capacity exceeded"

    new_occ_vol = profile.occupied_volume_dm3 + (req_qty * unit_vol if req_qty > 0 and unit_vol else 0)
    new_occ_w = profile.occupied_weight_kg + (req_qty * unit_weight if req_qty > 0 else 0)
    vol_util = (new_occ_vol / profile.total_volume_dm3 * 100) if profile.total_volume_dm3 > 0 else 0
    weight_util = (new_occ_w / profile.total_weight_kg * 100) if profile.total_weight_kg > 0 else 0

    units_per_carton = footprint.units_per_carton if use_carton else 1.0
    max_cartons = max_units if use_carton else (max_units / units_per_carton if units_per_carton else 0)

    return CapacityCalculationResult(
        fits=fits,
        max_units=max_units,
        max_cartons=max_cartons,
        remaining_units=max(0.0, max_units - req_qty),
        remaining_volume_dm3=rem_vol,
        remaining_weight_kg=rem_weight,
        volume_utilization_percent=min(100.0, vol_util),
        weight_utilization_percent=min(100.0, weight_util),
        failure_reason=failure,
        limiting_factor=limiting,
        method=method,
        confidence=confidence,
        explanation=explanation,
    )


def get_location_capacity_detail(
    db: Session,
    *,
    tenant_id: int,
    location_id: int,
    product_id: int | None = None,
    quantity: float = 0,
    packaging_mode: str = PACKAGING_UNIT,
) -> dict[str, Any]:
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        raise LocationNotFoundError(f"Location {location_id} not found")
    profile = location_profile_from_orm(loc)
    out: dict[str, Any] = {
        "location_id": profile.location_id,
        "location_code": profile.location_code,
        "warehouse_id": profile.warehouse_id,
        "total_volume_dm3": round(profile.total_volume_dm3, 4),
        "total_weight_kg": round(profile.total_weight_kg, 4),
        "occupied_volume_dm3": round(profile.occupied_volume_dm3, 4),
        "occupied_weight_kg": round(profile.occupied_weight_kg, 4),
        "capacity_utilization_percent": round(profile.utilization_percent, 2),
    }
    if product_id is not None:
        product = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
        if product is None:
            raise ProductNotFoundError(f"Product {product_id} not found")
        fit = calculate_location_capacity(loc, product, quantity, packaging_mode)
        out["fit"] = fit.to_dict()
        try:
            from .capacity_presentation import product_location_capacity_dict
            from .location_capacity_solver import solve_location_capacity

            solved = solve_location_capacity(db, location=loc, product=product, packaging_mode=packaging_mode)
            card = product_location_capacity_dict(solved)
            out["capacity"] = card
            out["product_capacity"] = card
        except Exception:
            pass
    return out


def batch_product_location_capacities(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    location_ids: list[int],
    packaging_mode: str = PACKAGING_UNIT,
) -> list[dict[str, Any]]:
    """One product × many locations — single product load, batched location query (max 80)."""
    from .capacity_presentation import product_location_capacity_dict
    from .location_capacity_solver import solve_location_capacity

    product = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if product is None:
        raise ProductNotFoundError(f"Product {product_id} not found")
    ids = [int(x) for x in location_ids if int(x) > 0][:80]
    if not ids:
        return []
    locs = db.query(Location).filter(Location.id.in_(ids)).all()
    by_id = {int(l.id): l for l in locs}
    out: list[dict[str, Any]] = []
    for lid in ids:
        loc = by_id.get(lid)
        if loc is None:
            continue
        solved = solve_location_capacity(db, location=loc, product=product, packaging_mode=packaging_mode)
        out.append(product_location_capacity_dict(solved))
    return out
