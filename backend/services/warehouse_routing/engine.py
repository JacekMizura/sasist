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
            message="Nie skonfigurowano jeszcze sieci tras.",
        )

    by_uuid = {n.uuid: n for n in nodes}
    if request.start_node_uuid not in by_uuid or request.destination_node_uuid not in by_uuid:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_NODE_NOT_FOUND,
            message="Nie znaleziono punktu startowego lub docelowego w sieci tras.",
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
            message="Nie narysowano jeszcze żadnej trasy. Wybierz „Rysuj trasę” i połącz co najmniej dwa punkty na mapie.",
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


def _route_on_adj(
    adj: dict[str, list[tuple[str, float, float, str]]],
    by_xy: dict[str, tuple[float, float]],
    start: str,
    goal: str,
) -> RouteComputeResponse:
    """Dijkstra helper for virtual-entry graphs (node ids may be synthetic)."""
    if start == goal:
        x, y = by_xy.get(start, (0.0, 0.0))
        return RouteComputeResponse(
            ok=True,
            nodes=[RoutePathPoint(node_uuid=start, x=x, y=y)],
            path_segments=[],
            distance_m=0.0,
            cost=0.0,
            hop_count=0,
        )
    dist_cost: dict[str, float] = {start: 0.0}
    dist_m: dict[str, float] = {start: 0.0}
    prev: dict[str, tuple[str, str, float, float]] = {}
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
            error_code=ERROR_NO_PATH,
            message="Brak trasy między punktami wejścia lokalizacji.",
        )
    path_nodes_rev: list[str] = [goal]
    segments_rev: list[RoutePathSegment] = []
    cur = goal
    while cur != start:
        if cur not in prev:
            return RouteComputeResponse(
                ok=False,
                error_code=ERROR_NO_PATH,
                message="Brak trasy między punktami wejścia lokalizacji.",
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
        RoutePathPoint(node_uuid=uid, x=by_xy[uid][0], y=by_xy[uid][1])
        for uid in path_nodes_rev
        if uid in by_xy
    ]
    return RouteComputeResponse(
        ok=True,
        nodes=points,
        path_segments=segments_rev,
        distance_m=round(dist_m.get(goal, 0.0), 4),
        cost=round(dist_cost.get(goal, 0.0), 4),
        hop_count=len(segments_rev),
    )


def route_via_virtual_entries(
    db: Session,
    warehouse_id: int,
    *,
    start_edge_uuid: str,
    start_t: float,
    start_approach_m: float,
    dest_edge_uuid: str,
    dest_t: float,
    dest_approach_m: float,
    process_type: Optional[str] = None,
    transport_type: Optional[str] = None,
) -> RouteComputeResponse:
    """
    Runtime-only virtual entry: split edges at t, route P_a→P_b, add approaches.
    Does NOT persist nodes — authored graph unchanged.
    """
    from .geometry import distance_m_between_cm
    from .location_access_geometry import point_on_segment as pop

    nodes = (
        db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == int(warehouse_id))
        .all()
    )
    if not nodes:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            message="Nie skonfigurowano jeszcze sieci tras.",
        )
    by_uuid = {n.uuid: n for n in nodes}
    edges = (
        db.query(WarehouseRoutingEdge)
        .filter(
            WarehouseRoutingEdge.warehouse_id == int(warehouse_id),
            WarehouseRoutingEdge.enabled.is_(True),
        )
        .all()
    )
    if not edges:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            message="Nie narysowano jeszcze żadnej trasy.",
        )

    def entry_xy(edge_uuid: str, t: float) -> tuple[float, float] | None:
        e = next((x for x in edges if x.uuid == edge_uuid), None)
        if e is None:
            return None
        a, b = by_uuid.get(e.from_node_uuid), by_uuid.get(e.to_node_uuid)
        if not a or not b:
            return None
        p = pop(float(a.x), float(a.y), float(b.x), float(b.y), t)
        return (p.x, p.y)

    start_xy = entry_xy(start_edge_uuid, start_t)
    dest_xy = entry_xy(dest_edge_uuid, dest_t)
    if start_xy is None or dest_xy is None:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_NODE_NOT_FOUND,
            message="Nie znaleziono odcinka wejścia lokalizacji.",
        )

    approach = float(start_approach_m or 0.0) + float(dest_approach_m or 0.0)
    if start_edge_uuid == dest_edge_uuid and abs(float(start_t) - float(dest_t)) < 1e-9:
        return RouteComputeResponse(
            ok=True,
            nodes=[RoutePathPoint(node_uuid="__virt_start__", x=start_xy[0], y=start_xy[1])],
            path_segments=[],
            distance_m=round(approach, 4),
            cost=round(approach, 4),
            hop_count=0,
        )

    adj = _directed_neighbors(edges, process_type=process_type, transport_type=transport_type)
    by_xy: dict[str, tuple[float, float]] = {n.uuid: (float(n.x), float(n.y)) for n in nodes}

    def splice(virtual_id: str, edge_uuid: str, xy: tuple[float, float]) -> None:
        e = next(x for x in edges if x.uuid == edge_uuid)
        a_id, b_id = e.from_node_uuid, e.to_node_uuid
        ax, ay = by_xy[a_id]
        bx, by_ = by_xy[b_id]
        d_a = distance_m_between_cm(ax, ay, xy[0], xy[1])
        d_b = distance_m_between_cm(xy[0], xy[1], bx, by_)
        mult = float(e.cost_multiplier if e.cost_multiplier is not None else 1.0) or 1e-9
        by_xy[virtual_id] = xy

        def strip(u: str, v: str) -> None:
            adj[u] = [x for x in adj.get(u, []) if not (x[0] == v and x[3] == edge_uuid)]

        d = (e.direction or DIRECTION_BOTH).upper()
        strip(a_id, b_id)
        strip(b_id, a_id)
        adj[virtual_id] = []
        if d == DIRECTION_FORWARD:
            adj.setdefault(a_id, []).append((virtual_id, d_a, d_a * mult, edge_uuid))
            adj[virtual_id].append((b_id, d_b, d_b * mult, edge_uuid))
        elif d == DIRECTION_BACKWARD:
            adj.setdefault(b_id, []).append((virtual_id, d_b, d_b * mult, edge_uuid))
            adj[virtual_id].append((a_id, d_a, d_a * mult, edge_uuid))
        else:
            adj.setdefault(a_id, []).append((virtual_id, d_a, d_a * mult, edge_uuid))
            adj.setdefault(b_id, []).append((virtual_id, d_b, d_b * mult, edge_uuid))
            adj[virtual_id].append((a_id, d_a, d_a * mult, edge_uuid))
            adj[virtual_id].append((b_id, d_b, d_b * mult, edge_uuid))

    v_start = "__virt_start__"
    v_dest = "__virt_dest__"
    splice(v_start, start_edge_uuid, start_xy)
    splice(v_dest, dest_edge_uuid, dest_xy)

    # Same physical edge: connect virtuals only in legal direction of travel (respect t-order).
    if start_edge_uuid == dest_edge_uuid:
        e = next(x for x in edges if x.uuid == start_edge_uuid)
        mult = float(e.cost_multiplier if e.cost_multiplier is not None else 1.0) or 1e-9
        mid = distance_m_between_cm(start_xy[0], start_xy[1], dest_xy[0], dest_xy[1])
        d = (e.direction or DIRECTION_BOTH).upper()
        st, dt = float(start_t), float(dest_t)
        if d == DIRECTION_FORWARD:
            if st <= dt:
                adj.setdefault(v_start, []).append((v_dest, mid, mid * mult, start_edge_uuid))
        elif d == DIRECTION_BACKWARD:
            if st >= dt:
                adj.setdefault(v_start, []).append((v_dest, mid, mid * mult, start_edge_uuid))
        else:
            adj.setdefault(v_start, []).append((v_dest, mid, mid * mult, start_edge_uuid))
            adj.setdefault(v_dest, []).append((v_start, mid, mid * mult, start_edge_uuid))

    core = _route_on_adj(adj, by_xy, v_start, v_dest)
    if not core.ok:
        return core
    return RouteComputeResponse(
        ok=True,
        nodes=core.nodes,
        path_segments=core.path_segments,
        distance_m=round((core.distance_m or 0.0) + approach, 4),
        cost=round((core.cost or 0.0) + approach, 4),
        hop_count=core.hop_count,
    )
