"""P5.8 prep — map RackSegment dimensions to slotting capacity engine (no allocation wiring yet)."""

from __future__ import annotations

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ..slotting.capacity_service import cm3_to_dm3
from ..slotting.slotting_models import DEFAULT_WEIGHT_KG_PER_DM3, LocationCapacityProfile
from .progress_helpers import format_segment_label
from .order_footprint_service import OrderFootprintResult, calculate_order_footprint


def segment_volume_capacity_dm3(
    length_mm: float | None,
    width_mm: float | None,
    height_mm: float | None,
) -> float:
    """Volume from segment outer dimensions (mm → dm³)."""
    l = float(length_mm or 0)
    w = float(width_mm or 0)
    h = float(height_mm or 0)
    if l > 0 and w > 0 and h > 0:
        return cm3_to_dm3(l * w * h / 1000.0)  # mm³ → cm³ → dm³
    return 0.0


def sync_segment_capacity_dm3(segment: RackSegment) -> float | None:
    """Recompute stored capacity_dm3 from mm fields; clear when incomplete."""
    vol = segment_volume_capacity_dm3(
        getattr(segment, "length_mm", None),
        getattr(segment, "width_mm", None),
        getattr(segment, "height_mm", None),
    )
    if vol > 0:
        segment.capacity_dm3 = round(vol, 4)
        return segment.capacity_dm3
    segment.capacity_dm3 = None
    return None


def resolve_segment_capacity_dm3(segment: RackSegment) -> float:
    stored = float(getattr(segment, "capacity_dm3", 0) or 0)
    if stored > 0:
        return stored
    return segment_volume_capacity_dm3(
        getattr(segment, "length_mm", None),
        getattr(segment, "width_mm", None),
        getattr(segment, "height_mm", None),
    )


def evaluate_capacity_match(
    order_volume_dm3: float,
    segment_capacity_dm3: float,
) -> dict:
    """Projection for UI / control tower — never blocks allocation."""
    capacity_unknown = segment_capacity_dm3 <= 0
    if capacity_unknown or order_volume_dm3 <= 0:
        return {
            "segment_capacity_dm3": segment_capacity_dm3 if segment_capacity_dm3 > 0 else None,
            "order_volume_dm3": round(order_volume_dm3, 4) if order_volume_dm3 > 0 else None,
            "utilization_percent": None,
            "capacity_overflow": False,
            "capacity_unknown": capacity_unknown,
            "scoring_applied": False,
        }

    utilization = round(order_volume_dm3 / segment_capacity_dm3 * 100.0, 1)
    overflow = order_volume_dm3 > segment_capacity_dm3
    return {
        "segment_capacity_dm3": round(segment_capacity_dm3, 4),
        "order_volume_dm3": round(order_volume_dm3, 4),
        "utilization_percent": utilization,
        "capacity_overflow": overflow,
        "capacity_unknown": False,
        "scoring_applied": True,
    }


def segment_as_location_capacity_profile(
    segment: RackSegment,
    level: ConsolidationRackLevel,
    rack: ConsolidationRack,
) -> LocationCapacityProfile:
    """
    Adapter for future fit checks via calculate_location_capacity().

    Occupied volume is not tracked yet (fill_percent is staging progress, not dm³).
    """
    total_vol = float(getattr(segment, "capacity_dm3", 0) or 0)
    if total_vol <= 0:
        total_vol = segment_volume_capacity_dm3(
            getattr(segment, "length_mm", None),
            getattr(segment, "width_mm", None),
            getattr(segment, "height_mm", None),
        )
    total_weight = total_vol * DEFAULT_WEIGHT_KG_PER_DM3 if total_vol > 0 else 0.0
    return LocationCapacityProfile(
        location_id=int(segment.id),
        location_code=format_segment_label(str(rack.name), level, segment),
        warehouse_id=int(rack.warehouse_id),
        total_volume_dm3=total_vol,
        total_weight_kg=total_weight,
        occupied_volume_dm3=0.0,
        occupied_weight_kg=0.0,
        utilization_percent=0.0,
        operational_zone="consolidation_rack",
        location_type="consolidation_segment",
    )


def build_segment_capacity_context(
    db,
    segment: RackSegment,
    level: ConsolidationRackLevel,
    rack: ConsolidationRack,
    order_id: int,
) -> dict:
    """Read-only capacity projection for UI / control tower."""
    cap = resolve_segment_capacity_dm3(segment)
    footprint: OrderFootprintResult = calculate_order_footprint(db, int(order_id))
    match = evaluate_capacity_match(footprint.volume_dm3, cap)
    return {
        **match,
        "dimension_estimated": footprint.dimension_estimated,
        "estimated_items_count": footprint.estimated_items_count,
        "total_items_count": footprint.total_items_count,
        "shelf_label": format_segment_label(str(rack.name), level, segment),
    }
