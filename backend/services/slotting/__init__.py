"""Slotting / capacity engine public exports."""

from .capacity_service import batch_product_location_capacities, calculate_location_capacity, get_location_capacity_detail
from .errors import CapacityOverflowError, LocationNotFoundError, ProductNotFoundError, SlottingError
from .heatmap_service import build_warehouse_heatmap
from .location_capacity_solver import solve_location_capacity
from .occupancy_service import recalculate_location_occupancy, recalculate_warehouse_occupancy
from .putaway_distribution_service import build_putaway_distribution_plan, revalidate_distribution_plan
from .putaway_strategy_service import suggest_putaway_locations, validate_putaway_assignment

__all__ = [
    "CapacityOverflowError",
    "LocationNotFoundError",
    "ProductNotFoundError",
    "SlottingError",
    "batch_product_location_capacities",
    "build_putaway_distribution_plan",
    "build_warehouse_heatmap",
    "calculate_location_capacity",
    "get_location_capacity_detail",
    "recalculate_location_occupancy",
    "recalculate_warehouse_occupancy",
    "revalidate_distribution_plan",
    "solve_location_capacity",
    "suggest_putaway_locations",
    "validate_putaway_assignment",
]
