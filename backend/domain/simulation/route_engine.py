"""
Route engine — visit-order heuristics for analytics simulations.

Physical distance is computed by Warehouse Routing Engine (access_resolution).
This module only orders stops (Euclidean NN) — not the SSOT for walking distance.
"""

from typing import Any, Hashable


def distance_euclidean_m(x1: float, y1: float, x2: float, y2: float) -> float:
    dx = (x2 - x1) / 100.0
    dy = (y2 - y1) / 100.0
    return (dx * dx + dy * dy) ** 0.5


def compute_visit_order_euclidean(
    start_node_id: Hashable | None,
    end_node_id: Hashable | None,
    pick_nodes: list[dict[str, Any]],
    node_xy_map: dict[Hashable, tuple[float, float]],
) -> list[Hashable]:
    """
    Compute visit order: START → pick nodes (nearest neighbor by Euclidean) → PACK.
    node ids may be int (legacy) or uuid str (authored graph).
    """

    def node_coords(nid: Hashable) -> tuple[float, float]:
        return node_xy_map.get(nid, (0.0, 0.0))

    visit_order: list[Hashable] = []
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
    visit_order: list[Hashable],
    node_xy_map: dict[Hashable, tuple[float, float]],
) -> float:
    """Sum of Euclidean distances — analytics heuristic only; prefer Routing Engine for real distance."""
    total = 0.0
    for i in range(len(visit_order) - 1):
        x1, y1 = node_xy_map.get(visit_order[i], (0.0, 0.0))
        x2, y2 = node_xy_map.get(visit_order[i + 1], (0.0, 0.0))
        total += distance_euclidean_m(x1, y1, x2, y2)
    return total
