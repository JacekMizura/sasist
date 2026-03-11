"""
Route engine — compute route START → pick nodes → PACKING.

Supports:
- Euclidean distance (current)
- Graph shortest path (future: Dijkstra along edges)
"""

from typing import Any

from .warehouse_graph_service import distance_euclidean_m


def compute_visit_order_euclidean(
    start_node_id: int | None,
    end_node_id: int | None,
    pick_nodes: list[dict[str, Any]],
    node_xy_map: dict[int, tuple[float, float]],
) -> list[int]:
    """
    Compute visit order: START → pick nodes (nearest neighbor by Euclidean) → PACK.
    pick_nodes: list of {"node_id": int, "x": float, "y": float, ...}.
    Returns list of node_ids in visit order (start, pick_1, ..., pick_n, end).
    """
    def node_coords(nid: int) -> tuple[float, float]:
        return node_xy_map.get(nid, (0.0, 0.0))

    visit_order: list[int] = []
    if start_node_id is not None:
        visit_order.append(start_node_id)
    remaining = [(p["node_id"], p["x"], p["y"]) for p in pick_nodes]
    while remaining:
        if not visit_order:
            break
        cx, cy = node_coords(visit_order[-1])
        best_idx = None
        best_d = float("inf")
        for i, (nid, nx, ny) in enumerate(remaining):
            d = distance_euclidean_m(cx, cy, nx, ny)
            if d < best_d:
                best_d = d
                best_idx = i
        if best_idx is None:
            break
        nid, nx, ny = remaining.pop(best_idx)
        visit_order.append(nid)
    if end_node_id is not None:
        visit_order.append(end_node_id)
    return visit_order


def compute_route_distance_euclidean(
    visit_order: list[int],
    node_xy_map: dict[int, tuple[float, float]],
) -> float:
    """Sum of Euclidean distances between consecutive nodes in visit_order (meters)."""
    total = 0.0
    for i in range(len(visit_order) - 1):
        x1, y1 = node_xy_map.get(visit_order[i], (0.0, 0.0))
        x2, y2 = node_xy_map.get(visit_order[i + 1], (0.0, 0.0))
        total += distance_euclidean_m(x1, y1, x2, y2)
    return total
