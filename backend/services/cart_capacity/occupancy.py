"""OccupancyState computation (presentation only)."""

from __future__ import annotations

from .enums import OCCUPANCY_WARNING_RATIO, OccupancyState


def compute_occupancy_state(
    *,
    usage_ratio: float,
    is_capacity_reached: bool,
    overflow: bool,
) -> OccupancyState:
    if overflow:
        return OccupancyState.OVERFLOW
    if is_capacity_reached:
        return OccupancyState.FULL
    if usage_ratio >= OCCUPANCY_WARNING_RATIO:
        return OccupancyState.WARNING
    return OccupancyState.AVAILABLE
