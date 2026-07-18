"""Capacity Engine exceptions."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class CartCapacityExceeded(Exception):
    current_orders: int
    capacity_orders: int
    attempted: int
    strategy: str = ""
    reason: str = "capacity_reached"

    @property
    def code(self) -> str:
        return "CART_CAPACITY_EXCEEDED"

    @property
    def max_orders(self) -> int:
        """Alias for older HTTP clients."""
        return int(self.capacity_orders)

    def to_detail(self) -> dict:
        return {
            "code": self.code,
            "strategy": self.strategy,
            "reason": self.reason,
            "current_orders": int(self.current_orders),
            "capacity_orders": int(self.capacity_orders),
            "max_orders": int(self.capacity_orders),
            "attempted": int(self.attempted),
        }
