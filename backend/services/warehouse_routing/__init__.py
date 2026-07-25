"""Authored Warehouse Routing Graph package — NEW SSOT (not legacy warehouse_graph).

Public WMS contract for routing = Runtime Graph Reader only
(``graph_ready``, ``hop_cost_m``, ``order_location_ids_by_graph``, ``chain_distance_m`` /
``runtime_chain_distance_m``, ``visit_index_map``).

``access_resolution`` distance helpers (``route_between_*``, ``chain_distance_*``) are INTERNAL —
import them from ``access_resolution`` only inside this package, Designer adapters, or tests.
"""

from .engine import route_a_to_b
from .graph_service import get_graph, replace_graph
from .intersection import materialize_intersections
from .runtime_graph_reader import (
    chain_distance_m as runtime_chain_distance_m,
    graph_ready,
    hop_cost_m,
    order_location_ids_by_graph,
    visit_index_map,
)
from .validation import validate_graph

# Authoring / Designer graph CRUD (not WMS walk routing).
__all__ = [
    "route_a_to_b",
    "get_graph",
    "replace_graph",
    "validate_graph",
    "materialize_intersections",
    # Etap 3 / 3.1 — Runtime Graph Reader (WMS SSOT)
    "graph_ready",
    "hop_cost_m",
    "order_location_ids_by_graph",
    "visit_index_map",
    "runtime_chain_distance_m",
]
