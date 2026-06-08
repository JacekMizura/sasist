"""Location capacity fit calculations — conservative volume + weight heuristics."""

from __future__ import annotations

import math
from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.product import Product
from .constraint_service import check_orientation_compatible, check_stacking_compatible, normalize_orientation, normalize_stacking
from .errors import LocationNotFoundError, ProductNotFoundError
from .slotting_models import (
    DEFAULT_WEIGHT_KG_PER_DM3,
    MIN_USABLE_VOLUME_DM3,
    PACKAGING_CARTON,
    PACKAGING_UNIT,
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
        volume_dm3=max(vol, MIN_USABLE_VOLUME_DM3),
        orientation=normalize_orientation(orient_raw),
        stacking_mode=normalize_stacking(stack_raw, packaging_carton=use_carton),
        compressible=compressible,
        max_stack_weight_kg=float(max_stack) if max_stack is not None else None,
        units_per_carton=units_per,
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
    )


def calculate_location_capacity(
    location: Location | LocationCapacityProfile,
    product: Product | ProductFootprint,
    quantity: float,
    packaging_mode: str = PACKAGING_UNIT,
) -> CapacityCalculationResult:
    """Determine fit, max units, remaining capacity, limiting factor."""
    profile = location if isinstance(location, LocationCapacityProfile) else location_profile_from_orm(location)
    footprint = product if isinstance(product, ProductFootprint) else product_footprint_from_orm(product, packaging_mode=packaging_mode)

    use_carton = str(packaging_mode or PACKAGING_UNIT).upper() == PACKAGING_CARTON
    unit_vol = footprint.volume_dm3
    unit_weight = footprint.weight_kg
    req_qty = max(0.0, float(quantity or 0))

    ok_orient, orient_reason = check_orientation_compatible(footprint, profile.location_type)
    if not ok_orient:
        return CapacityCalculationResult(
            fits=False,
            max_units=0,
            max_cartons=0,
            remaining_units=0,
            remaining_volume_dm3=max(0.0, profile.total_volume_dm3 - profile.occupied_volume_dm3),
            remaining_weight_kg=max(0.0, profile.total_weight_kg - profile.occupied_weight_kg),
            volume_utilization_percent=profile.utilization_percent,
            weight_utilization_percent=0,
            failure_reason=orient_reason,
            limiting_factor="orientation",
        )

    ok_stack, stack_reason, stack_layers = check_stacking_compatible(
        footprint, packaging_carton=use_carton, requested_qty=req_qty
    )
    if not ok_stack:
        return CapacityCalculationResult(
            fits=False,
            max_units=0,
            max_cartons=0,
            remaining_units=0,
            remaining_volume_dm3=max(0.0, profile.total_volume_dm3 - profile.occupied_volume_dm3),
            remaining_weight_kg=max(0.0, profile.total_weight_kg - profile.occupied_weight_kg),
            volume_utilization_percent=profile.utilization_percent,
            weight_utilization_percent=0,
            failure_reason=stack_reason,
            limiting_factor="stacking",
        )

    rem_vol = max(0.0, profile.total_volume_dm3 - profile.occupied_volume_dm3)
    rem_weight = max(0.0, profile.total_weight_kg - profile.occupied_weight_kg)

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
        )

    max_by_vol = (rem_vol / unit_vol) * stack_layers if unit_vol > 0 and rem_vol > 0 else 0
    max_by_weight = rem_weight / unit_weight if unit_weight > 0 and rem_weight > 0 else 0
    max_units = min(max_by_vol, max_by_weight) if max_by_vol > 0 and max_by_weight > 0 else max(max_by_vol, max_by_weight)
    max_units = max(0.0, math.floor(max_units * 10000) / 10000)

    if footprint.max_stack_weight_kg and unit_weight > 0:
        max_by_stack_weight = footprint.max_stack_weight_kg / unit_weight
        max_units = min(max_units, max_by_stack_weight)

    limiting = None
    if max_by_vol <= max_by_weight and max_by_vol > 0:
        limiting = "volume"
    elif max_by_weight > 0:
        limiting = "weight"

    fits = req_qty <= 0 or max_units >= req_qty
    failure = None
    if not fits:
        if limiting == "weight":
            failure = "Location exceeds weight limit"
        elif limiting == "volume":
            failure = "Insufficient remaining volume"
        else:
            failure = "Capacity exceeded"

    new_occ_vol = profile.occupied_volume_dm3 + (req_qty * unit_vol if req_qty > 0 else 0)
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
    return out
