"""
Picking strategy simulation — output metrics.

Used by analytics to compare strategies. No execution logic.
"""

from dataclasses import dataclass


@dataclass
class StrategySimulationResult:
    """Result of simulating one picking strategy for a set of orders."""

    strategy_name: str
    total_walking_distance: float  # meters
    estimated_picking_time: float  # seconds
    estimated_packing_time: float  # seconds
    required_picker_count: int
    orders_per_hour: float

    def to_dict(self) -> dict:
        return {
            "strategy_name": self.strategy_name,
            "total_walking_distance": round(self.total_walking_distance, 2),
            "estimated_picking_time": round(self.estimated_picking_time, 1),
            "estimated_packing_time": round(self.estimated_packing_time, 1),
            "required_picker_count": self.required_picker_count,
            "orders_per_hour": round(self.orders_per_hour, 1),
        }
