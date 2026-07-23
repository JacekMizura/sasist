"""
Unified warehouse simulation engine (analytics).

Physical routing SSOT: backend.services.warehouse_routing
Legacy WarehouseNode helpers were removed in Stage 2 migration.
"""

from .route_engine import (
    compute_visit_order_euclidean,
    compute_route_distance_euclidean,
    distance_euclidean_m,
)
from .picking_simulation_engine import (
    simulate_single_order,
)
from .batch_picking_engine import (
    simulate_batch_orders,
)

__all__ = [
    "distance_euclidean_m",
    "compute_visit_order_euclidean",
    "compute_route_distance_euclidean",
    "simulate_single_order",
    "simulate_batch_orders",
]
