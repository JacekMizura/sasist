"""Capacity strategy + occupancy enums (not Cart.status)."""

from __future__ import annotations

import enum


class CapacityStrategy(str, enum.Enum):
    LIMIT_ORDERS = "LIMIT_ORDERS"
    LIMIT_VOLUME = "LIMIT_VOLUME"
    HYBRID_STOP_FIRST = "HYBRID_STOP_FIRST"
    HYBRID_STOP_VOLUME = "HYBRID_STOP_VOLUME"
    BASKETS = "BASKETS"


class OccupancyState(str, enum.Enum):
    """Computed presentation only — never persisted."""

    AVAILABLE = "AVAILABLE"
    WARNING = "WARNING"
    FULL = "FULL"
    OVERFLOW = "OVERFLOW"


# Warning threshold for occupancy_state (usage percent)
OCCUPANCY_WARNING_RATIO = 0.8

# Legacy DB / API values → canonical strategy (one-shot migration)
LEGACY_CAPACITY_MODE_TO_STRATEGY: dict[str, CapacityStrategy] = {
    "volume": CapacityStrategy.LIMIT_VOLUME,
    "orders": CapacityStrategy.LIMIT_ORDERS,
    "mixed": CapacityStrategy.HYBRID_STOP_FIRST,
    "limit_volume": CapacityStrategy.LIMIT_VOLUME,
    "limit_orders": CapacityStrategy.LIMIT_ORDERS,
    "hybrid": CapacityStrategy.HYBRID_STOP_FIRST,
    "hybrid_stop_first": CapacityStrategy.HYBRID_STOP_FIRST,
    "hybrid_stop_volume": CapacityStrategy.HYBRID_STOP_VOLUME,
    "baskets": CapacityStrategy.BASKETS,
}
