"""Slotting / capacity engine public exports."""

from .capacity_service import calculate_location_capacity, get_location_capacity_detail
from .errors import CapacityOverflowError, LocationNotFoundError, ProductNotFoundError, SlottingError
from .heatmap_service import build_warehouse_heatmap
from .occupancy_service import recalculate_location_occupancy, recalculate_warehouse_occupancy
from .putaway_strategy_service import suggest_putaway_locations, validate_putaway_assignment

__all__ = [
    "CapacityOverflowError",
    "LocationNotFoundError",
    "ProductNotFoundError",
    "SlottingError",
    "build_warehouse_heatmap",
    "calculate_location_capacity",
    "get_location_capacity_detail",
    "recalculate_location_occupancy",
    "recalculate_warehouse_occupancy",
    "suggest_putaway_locations",
    "validate_putaway_assignment",
]
