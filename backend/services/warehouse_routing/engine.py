"""
Warehouse Routing Engine — A→B on authored graph ONLY.

No fallback to legacy WarehouseNode/WarehouseEdge.
Missing graph → ROUTING_GRAPH_NOT_CONFIGURED.
"""

from __future__ import annotations

import heapq
import json
from typing import Optional

from sqlalchemy.orm import Session

from ...models.warehouse_routing import WarehouseRoutingEdge, WarehouseRoutingNode
from ...schemas.warehouse_routing import (
    RouteComputeRequest,
    RouteComputeResponse,
    RoutePathPoint,
    RoutePathSegment,
)
from .constants import (
    DIRECTION_BACKWARD,
    DIRECTION_BOTH,
    DIRECTION_FORWARD,
    ERROR_DISCONNECTED,
    ERROR_NODE_NOT_FOUND,
    ERROR_NO_PATH,
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
)


def _parse_list(raw: Optional[str]) -> list[str]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            return [str(x) for x in data]
    except Exception:
        pass
    return []


def _edge_allows(edge: WarehouseRoutingEdge, process_type: Optional[str], transport_type: Optional[str]) -> bool:
    if not edge.enabled:
        return False
    procs = _parse_list(edge.allowed_processes_json)
    if procs and process_type and process_type not in procs and "any" not in procs:
        return False
    transports = _parse_list(edge.allowed_transport_types_json)
    if transports and transport_type and transport_type not in transports and "any" not in transports:
        return False
    return True


def _directed_neighbors(
    edges: list[WarehouseRoutingEdge],
    *,
    process_type: Optional[str],
    transport_type: Optional[str],
) -> dict[str, list[tuple[str, float, float, str]]]:
    """
    adjacency: node_uuid -> [(neighbor_uuid, distance_m, cost, edge_uuid), ...]
    cost = distance_m * cost_multiplier
    """
    adj: dict[str, list[tuple[str, float, float, str]]] = {}

    def add(u: str, v: str, dist: float, cost: float, edge_uuid: str) -> None:
        adj.setdefault(u, []).append((v, dist, cost, edge_uuid))

    for e in edges:
        if not _edge_allows(e, process_type, transport_type):
            continue
        dist = float(e.distance_m or 0.0)
        mult = float(e.cost_multiplier if e.cost_multiplier is not None else 1.0)
        if mult <= 0:
            mult = 1e-9
        cost = dist * mult
        d = (e.direction or DIRECTION_BOTH).upper()
        if d == DIRECTION_BOTH:
            add(e.from_node_uuid, e.to_node_uuid, dist, cost, e.uuid)
            add(e.to_node_uuid, e.from_node_uuid, dist, cost, e.uuid)
        elif d == DIRECTION_FORWARD:
            add(e.from_node_uuid, e.to_node_uuid, dist, cost, e.uuid)
        elif d == DIRECTION_BACKWARD:
            add(e.to_node_uuid, e.from_node_uuid, dist, cost, e.uuid)
        else:
            add(e.from_node_uuid, e.to_node_uuid, dist, cost, e.uuid)
            add(e.to_node_uuid, e.from_node_uuid, dist, cost, e.uuid)
    return adj


def route_a_to_b(
    db: Session,
    warehouse_id: int,
    request: RouteComputeRequest,
) -> RouteComputeResponse:
    """
    Shortest path by cost (distance * cost_multiplier) with direction/process/transport filters.
    """
    nodes = (
        db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == int(warehouse_id))
        .all()
    )
    if not nodes:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            message="Brak skonfigurowanej sieci tras (authored Routing Graph).",
        )

    by_uuid = {n.uuid: n for n in nodes}
    if request.start_node_uuid not in by_uuid or request.destination_node_uuid not in by_uuid:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_NODE_NOT_FOUND,
            message="Nie znaleziono węzła startowego lub docelowego w sieci tras.",
        )

    edges = (
        db.query(WarehouseRoutingEdge)
        .filter(WarehouseRoutingEdge.warehouse_id == int(warehouse_id))
        .all()
    )
    if not edges:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            message="Sieć tras nie ma odcinków (edges).",
        )

    adj = _directed_neighbors(
        edges,
        process_type=request.process_type,
        transport_type=request.transport_type,
    )

    start = request.start_node_uuid
    goal = request.destination_node_uuid
    if start == goal:
        n = by_uuid[start]
        return RouteComputeResponse(
            ok=True,
            nodes=[RoutePathPoint(node_uuid=n.uuid, x=float(n.x), y=float(n.y))],
            path_segments=[],
            distance_m=0.0,
            cost=0.0,
            hop_count=0,
        )

    # Dijkstra on cost
    dist_cost: dict[str, float] = {start: 0.0}
    dist_m: dict[str, float] = {start: 0.0}
    prev: dict[str, tuple[str, str, float, float]] = {}  # node -> (prev_node, edge_uuid, seg_dist, seg_cost)
    heap: list[tuple[float, str]] = [(0.0, start)]
    seen: set[str] = set()

    while heap:
        cost_u, u = heapq.heappop(heap)
        if u in seen:
            continue
        seen.add(u)
        if u == goal:
            break
        for v, seg_d, seg_c, edge_uuid in adj.get(u, []):
            nc = cost_u + seg_c
            if nc < dist_cost.get(v, float("inf")):
                dist_cost[v] = nc
                dist_m[v] = dist_m.get(u, 0.0) + seg_d
                prev[v] = (u, edge_uuid, seg_d, seg_c)
                heapq.heappush(heap, (nc, v))

    if goal not in prev and start != goal:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_DISCONNECTED if goal not in adj and start not in adj else ERROR_NO_PATH,
            message="Brak trasy do celu (odłączony graf, kierunek lub ograniczenia procesu/transportu).",
        )

    # Reconstruct
    path_nodes_rev: list[str] = [goal]
    segments_rev: list[RoutePathSegment] = []
    cur = goal
    while cur != start:
        if cur not in prev:
            return RouteComputeResponse(
                ok=False,
                error_code=ERROR_NO_PATH,
                message="Brak trasy do celu.",
            )
        p, edge_uuid, seg_d, seg_c = prev[cur]
        segments_rev.append(
            RoutePathSegment(
                edge_uuid=edge_uuid,
                from_node_uuid=p,
                to_node_uuid=cur,
                distance_m=round(seg_d, 4),
                cost=round(seg_c, 4),
            )
        )
        path_nodes_rev.append(p)
        cur = p

    path_nodes_rev.reverse()
    segments_rev.reverse()
    points = [
        RoutePathPoint(node_uuid=uid, x=float(by_uuid[uid].x), y=float(by_uuid[uid].y))
        for uid in path_nodes_rev
        if uid in by_uuid
    ]
    total_d = dist_m.get(goal, 0.0)
    total_c = dist_cost.get(goal, 0.0)
    return RouteComputeResponse(
        ok=True,
        nodes=points,
        path_segments=segments_rev,
        distance_m=round(total_d, 4),
        cost=round(total_c, 4),
        hop_count=len(segments_rev),
    )
