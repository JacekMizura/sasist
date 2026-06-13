"""P5.8 prep — map RackSegment dimensions to slotting capacity engine (no allocation wiring yet)."""

from __future__ import annotations

from ...models.consolidation_rack import ConsolidationRack, ConsolidationRackLevel, RackSegment
from ..slotting.capacity_service import cm3_to_dm3
from ..slotting.slotting_models import DEFAULT_WEIGHT_KG_PER_DM3, LocationCapacityProfile
from .progress_helpers import format_segment_label

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
