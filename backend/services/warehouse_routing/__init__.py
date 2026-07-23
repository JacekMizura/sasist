"""Authored Warehouse Routing Graph package — NEW SSOT (not legacy warehouse_graph)."""

from .access_resolution import (
    access_node_uuids_for_location,
    chain_distance_through_location_ids,
    is_routing_graph_configured,
    route_between_locations,
    route_between_points_cm,
    route_best_among_candidates,
)
from .engine import route_a_to_b
from .graph_service import get_graph, replace_graph
from .intersection import materialize_intersections
from .validation import validate_graph

__all__ = [
    "route_a_to_b",
    "get_graph",
    "replace_graph",
    "validate_graph",
    "materialize_intersections",
    "is_routing_graph_configured",
    "access_node_uuids_for_location",
    "route_best_among_candidates",
    "route_between_locations",
    "route_between_points_cm",
    "chain_distance_through_location_ids",
]
