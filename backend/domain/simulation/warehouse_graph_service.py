"""
Warehouse graph service — central access to warehouse graph and distances.

- Load warehouse nodes and edges
- Map locations to graph nodes
- Distance calculations (Euclidean; graph shortest path for future Dijkstra)
- Shortest-path utilities (Dijkstra)
"""

import math
from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse_graph import WarehouseNode, WarehouseEdge, LocationNode


def get_location_to_node_map(db: Session, warehouse_id: int) -> dict[int, tuple[int, float, float]]:
    """
    Build location_id -> (node_id, x_cm, y_cm) from LocationNode + WarehouseNode.
    Returns dict of location_id -> (node_id, x_cm, y_cm).
    """
    node_ids = [
        r[0] for r in db.query(WarehouseNode.id).filter(WarehouseNode.warehouse_id == warehouse_id).all()
    ]
    if not node_ids:
        return {}
    loc_node_rows = (
        db.query(LocationNode.location_id, LocationNode.node_id)
        .filter(LocationNode.node_id.in_(node_ids))
        .all()
    )
    node_id_to_xy: dict[int, tuple[float, float]] = {}
    for n in db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y).filter(
        WarehouseNode.id.in_(node_ids)
    ).all():
        node_id_to_xy[n.id] = (float(n.x), float(n.y))
    result: dict[int, tuple[int, float, float]] = {}
    for loc_id, nid in loc_node_rows:
        xy = node_id_to_xy.get(nid)
        if xy is not None:
            result[loc_id] = (nid, xy[0], xy[1])
    return result


def get_special_locations_xy(db: Session, warehouse_id: int) -> tuple[tuple[float, float] | None, tuple[float, float] | None]:
    """
    Return (pick_start_xy, packing_xy) in cm. Each is (x, y) or None.
    Uses Location.location_type PICK_START and PACKING.
    """
    rows = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.location_type.in_(["PICK_START", "PACKING"]),
        )
        .all()
    )
    pick_start = next((l for l in rows if l.location_type == "PICK_START"), None)
    packing = next((l for l in rows if l.location_type == "PACKING"), None)
    start_xy = (float(pick_start.x or 0), float(pick_start.y or 0)) if pick_start else None
    pack_xy = (float(packing.x or 0), float(packing.y or 0)) if packing else None
    return start_xy, pack_xy


def get_node_nearest_to_point(db: Session, warehouse_id: int, x_cm: float, y_cm: float) -> int | None:
    """Graph node nearest to (x_cm, y_cm). Coordinates in cm."""
    nodes = (
        db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y)
        .filter(WarehouseNode.warehouse_id == warehouse_id)
        .all()
    )
    if not nodes:
        return None
    best = min(
        nodes,
        key=lambda n: (float(n.x) - x_cm) ** 2 + (float(n.y) - y_cm) ** 2,
    )
    return best[0]


def get_start_node_for_warehouse(db: Session, warehouse_id: int) -> int | None:
    """Packing node for warehouse, or node closest to (0,0). Used when no PICK_START/PACKING locations."""
    packing = (
        db.query(WarehouseNode.id)
        .filter(WarehouseNode.warehouse_id == warehouse_id, WarehouseNode.type == "packing")
        .first()
    )
    if packing:
        return packing[0]
    nodes = (
        db.query(WarehouseNode.id, WarehouseNode.x, WarehouseNode.y)
        .filter(WarehouseNode.warehouse_id == warehouse_id)
        .all()
    )
    if not nodes:
        return None
    best = min(nodes, key=lambda n: (float(n.x) ** 2 + float(n.y) ** 2) ** 0.5)
    return best[0]


def get_adjacency(db: Session, warehouse_id: int) -> dict[int, list[tuple[int, float]]]:
    """Adjacency list: node_id -> [(neighbor_id, distance_m), ...]. Bidirectional."""
    adj: dict[int, list[tuple[int, float]]] = {}
    for e in db.query(WarehouseEdge).filter(WarehouseEdge.warehouse_id == warehouse_id).all():
        d = float(e.distance_m)
        adj.setdefault(e.node_from_id, []).append((e.node_to_id, d))
        adj.setdefault(e.node_to_id, []).append((e.node_from_id, d))
    return adj


def distance_euclidean_m(x1_cm: float, y1_cm: float, x2_cm: float, y2_cm: float) -> float:
    """Euclidean distance in meters. Inputs in cm."""
    dx = (x2_cm - x1_cm) * 0.01
    dy = (y2_cm - y1_cm) * 0.01
    return math.sqrt(dx * dx + dy * dy)


def distance_point_to_point_cm(x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in cm. For slotting (distance to packing)."""
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)


def shortest_path_dijkstra(
    adj: dict[int, list[tuple[int, float]]],
    start: int,
    end: int,
) -> tuple[float, list[int]]:
    """
    Shortest path from start to end using Dijkstra.
    Returns (distance_m, path_node_ids). Path includes start and end.
    """
    import heapq
    if start == end:
        return 0.0, [start]
    if start not in adj or end not in adj:
        return float("inf"), []
    dist: dict[int, float] = {start: 0.0}
    prev: dict[int, int] = {}
    heap: list[tuple[float, int]] = [(0.0, start)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == end:
            path = []
            cur = end
            while cur is not None:
                path.append(cur)
                cur = prev.get(cur)
            path.reverse()
            return round(d, 4), path
        if d > dist.get(u, float("inf")):
            continue
        for v, w in adj.get(u, []):
            new_d = d + w
            if new_d < dist.get(v, float("inf")):
                dist[v] = new_d
                prev[v] = u
                heapq.heappush(heap, (new_d, v))
    return float("inf"), []


def dijkstra_dist(adj: dict[int, list[tuple[int, float]]], start: int, end: int) -> float:
    """Shortest path distance in meters. Returns inf if no path."""
    dist_m, _ = shortest_path_dijkstra(adj, start, end)
    return dist_m
