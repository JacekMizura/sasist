"""Capacity Engine DTOs — computed, not persisted as lifecycle status."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .enums import CapacityStrategy, OccupancyState


@dataclass(frozen=True)
class BasketSlotSnapshot:
    id: int
    occupied: bool
    order_id: int | None
    usable_volume: float
    used_volume: float
    remaining_volume: float


@dataclass(frozen=True)
class BasketSummary:
    total: int
    occupied: int
    free: int
    slots: tuple[BasketSlotSnapshot, ...] = ()

    def to_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "occupied": self.occupied,
            "free": self.free,
            "slots": [asdict(s) for s in self.slots],
        }


@dataclass(frozen=True)
class CapacitySnapshot:
    strategy: CapacityStrategy
    occupancy_state: OccupancyState
    capacity_orders: int | None
    capacity_volume: float | None
    assigned_orders: int
    assigned_volume: float
    remaining_orders: int | None
    remaining_volume: float | None
    capacity_usage_percent: float
    is_capacity_reached: bool
    basket_summary: BasketSummary | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "strategy": self.strategy.value,
            "occupancy_state": self.occupancy_state.value,
            "capacity_orders": self.capacity_orders,
            "capacity_volume": self.capacity_volume,
            "assigned_orders": self.assigned_orders,
            "assigned_volume": round(float(self.assigned_volume), 4),
            "remaining_orders": self.remaining_orders,
            "remaining_volume": (
                None
                if self.remaining_volume is None
                else round(float(self.remaining_volume), 4)
            ),
            "capacity_usage_percent": round(float(self.capacity_usage_percent), 2),
            "is_capacity_reached": bool(self.is_capacity_reached),
            "basket_summary": None if self.basket_summary is None else self.basket_summary.to_dict(),
        }


@dataclass
class BasketWorking:
    basket_id: int
    usable_volume: float
    order_id: int | None = None
    used_volume: float = 0.0

    @property
    def occupied(self) -> bool:
        return self.order_id is not None

    @property
    def remaining_volume(self) -> float:
        if self.occupied:
            return 0.0
        return max(0.0, float(self.usable_volume) - float(self.used_volume))


@dataclass
class EngineState:
    strategy: CapacityStrategy
    capacity_orders: int | None
    capacity_volume: float | None
    assigned_orders: int = 0
    assigned_volume: float = 0.0
    baskets: list[BasketWorking] = field(default_factory=list)
    # last basket chosen by accept() for BASKETS
    last_basket_id: int | None = None
