"""
Unified warehouse simulation engine.

Centralizes warehouse graph access, route computation, and picking simulation
for analytics (pick route, walking cost, slotting, batch picking).
"""

from .warehouse_graph_service import (
    get_location_to_node_map,
    get_special_locations_xy,
    get_node_nearest_to_point,
    get_start_node_for_warehouse,
    get_adjacency,
    distance_euclidean_m,
    distance_point_to_point_cm,
    shortest_path_dijkstra,
    dijkstra_dist,
)
from .route_engine import (
    compute_visit_order_euclidean,
    compute_route_distance_euclidean,
)
from .picking_simulation_engine import (
    simulate_single_order,
)
from .batch_picking_engine import (
    simulate_batch_orders,
)

__all__ = [
    "get_location_to_node_map",
    "get_special_locations_xy",
    "get_node_nearest_to_point",
    "get_start_node_for_warehouse",
    "get_adjacency",
    "distance_euclidean_m",
    "distance_point_to_point_cm",
    "shortest_path_dijkstra",
    "dijkstra_dist",
    "compute_visit_order_euclidean",
    "compute_route_distance_euclidean",
    "simulate_single_order",
    "simulate_batch_orders",
]
