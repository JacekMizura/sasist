"""
Runtime Graph Reader — jedyny reader routingu dla runtime WMS (Etap 3).

Projektant publikuje Authored Warehouse Routing Graph.
WMS / Wave / Picking / Analytics / Simulation czytają wyłącznie stąd.

Brak Manhattan, label-heurystyk i lokalnych obliczeń odległości.
Brak drugiego grafu.
"""

from __future__ import annotations

from typing import Optional, Sequence

from sqlalchemy.orm import Session

from .access_resolution import (
    access_node_uuids_for_location,
    chain_distance_through_location_ids,
    is_routing_graph_configured,
    packing_node_uuid,
    picking_start_node_uuid,
    route_best_among_candidates,
    route_between_locations,
)
from .constants import (
    ERROR_NO_PATH,
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    PROCESS_PICKING,
    TRANSPORT_FOOT,
)
from .engine import route_a_to_b, route_via_virtual_entries
from ...schemas.warehouse_routing import RouteComputeRequest


def graph_ready(db: Session, warehouse_id: int) -> bool:
    return is_routing_graph_configured(db, int(warehouse_id))


def hop_cost_m(
    db: Session,
    warehouse_id: int,
    from_location_id: int,
    to_location_id: int,
    *,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> tuple[Optional[float], Optional[str]]:
    """
    Koszt przejścia lokalizacja → lokalizacja z authored graph.
    Preferuje Location Access (virtual entries), potem AccessPoints.
    """
    wid = int(warehouse_id)
    if not graph_ready(db, wid):
        return None, ERROR_ROUTING_GRAPH_NOT_CONFIGURED
    if int(from_location_id) == int(to_location_id):
        return 0.0, None

    from .location_access_service import get_location_access

    try:
        a = get_location_access(db, wid, int(from_location_id))
        b = get_location_access(db, wid, int(to_location_id))
    except Exception:
        # Table may be absent in unit fixtures — fall through to AccessPoints.
        a = None
        b = None
    if a is not None and b is not None:
        res = route_via_virtual_entries(
            db,
            wid,
            start_edge_uuid=str(a.edge_uuid),
            start_t=float(a.t),
            start_approach_m=float(a.access_approach_m or 0.0),
            dest_edge_uuid=str(b.edge_uuid),
            dest_t=float(b.t),
            dest_approach_m=float(b.access_approach_m or 0.0),
            process_type=process_type,
            transport_type=transport_type,
        )
        if res.ok:
            return float(res.cost if res.cost is not None else res.distance_m or 0.0), None

    res = route_between_locations(
        db,
        wid,
        int(from_location_id),
        int(to_location_id),
        process_type=process_type,
        transport_type=transport_type,
    )
    if res.ok:
        return float(res.cost if res.cost is not None else res.distance_m or 0.0), None
    return None, res.error_code or ERROR_NO_PATH


def cost_from_node_to_location(
    db: Session,
    warehouse_id: int,
    start_node_uuid: str,
    location_id: int,
    *,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> tuple[Optional[float], Optional[str]]:
    wid = int(warehouse_id)
    if not graph_ready(db, wid):
        return None, ERROR_ROUTING_GRAPH_NOT_CONFIGURED
    dests = access_node_uuids_for_location(db, wid, int(location_id))
    if not dests:
        # Location Access only — snap via nearest node on access edge endpoints
        from .location_access_service import get_location_access
        from ...models.warehouse_routing import WarehouseRoutingEdge

        try:
            la = get_location_access(db, wid, int(location_id))
        except Exception:
            la = None
        if la is None:
            return None, ERROR_NO_PATH
        edge = (
            db.query(WarehouseRoutingEdge)
            .filter(
                WarehouseRoutingEdge.warehouse_id == wid,
                WarehouseRoutingEdge.uuid == str(la.edge_uuid),
            )
            .first()
        )
        if edge is None:
            return None, ERROR_NO_PATH
        dests = [str(edge.from_node_uuid), str(edge.to_node_uuid)]
    res = route_best_among_candidates(
        db,
        wid,
        [str(start_node_uuid)],
        dests,
        process_type=process_type,
        transport_type=transport_type,
    )
    if not res.ok:
        return None, res.error_code or ERROR_NO_PATH
    return float(res.cost if res.cost is not None else res.distance_m or 0.0), None


def order_location_ids_by_graph(
    db: Session,
    warehouse_id: int,
    location_ids: Sequence[int],
    *,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> tuple[list[int], Optional[str]]:
    """
    Kolejność odwiedzin: greedy NN po koszcie grafu od PICKING_START.
    Deterministyczna (przy remisie: mniejszy location_id).
    Gdy graf niegotowy → sort po location_id (bez heurystyki geometrycznej).
    """
    wid = int(warehouse_id)
    uniq: list[int] = []
    seen: set[int] = set()
    for raw in location_ids:
        lid = int(raw)
        if lid in seen:
            continue
        seen.add(lid)
        uniq.append(lid)
    if not uniq:
        return [], None
    if not graph_ready(db, wid):
        return sorted(uniq), ERROR_ROUTING_GRAPH_NOT_CONFIGURED

    start = picking_start_node_uuid(db, wid)
    remaining = set(uniq)
    ordered: list[int] = []
    cursor_loc: Optional[int] = None
    cursor_node = start

    while remaining:
        best_lid: Optional[int] = None
        best_cost: Optional[float] = None
        for lid in sorted(remaining):  # stable candidates
            if cursor_loc is None and cursor_node:
                cost, err = cost_from_node_to_location(
                    db,
                    wid,
                    cursor_node,
                    lid,
                    process_type=process_type,
                    transport_type=transport_type,
                )
            elif cursor_loc is not None:
                cost, err = hop_cost_m(
                    db,
                    wid,
                    cursor_loc,
                    lid,
                    process_type=process_type,
                    transport_type=transport_type,
                )
            else:
                # No start node: first stop = min location_id among remaining (deterministic seed)
                cost, err = 0.0, None
            if err and cost is None:
                continue
            c = float(cost if cost is not None else float("inf"))
            if best_cost is None or c < best_cost or (c == best_cost and (best_lid is None or lid < best_lid)):
                best_cost = c
                best_lid = lid
        if best_lid is None:
            # Unreachable leftovers — append by id (deterministic, not geometric)
            ordered.extend(sorted(remaining))
            break
        ordered.append(best_lid)
        remaining.discard(best_lid)
        cursor_loc = best_lid
        cursor_node = None

    return ordered, None


def chain_distance_m(
    db: Session,
    warehouse_id: int,
    location_ids_in_order: Sequence[int],
    *,
    include_start: bool = True,
    include_packing: bool = True,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> tuple[Optional[float], Optional[str], list[str]]:
    """Koszt łańcucha lokalizacji z authored graph (opcjonalnie START/PACKING)."""
    wid = int(warehouse_id)
    start = picking_start_node_uuid(db, wid) if include_start else None
    end = packing_node_uuid(db, wid) if include_packing else None
    return chain_distance_through_location_ids(
        db,
        wid,
        [int(x) for x in location_ids_in_order],
        start_node_uuid=start,
        end_node_uuid=end,
        process_type=process_type,
        transport_type=transport_type,
    )


def visit_index_map(
    db: Session,
    warehouse_id: int,
    location_ids: Sequence[int],
) -> dict[int, int]:
    """Mapa location_id → indeks kolejności trasy (0..n-1)."""
    ordered, _ = order_location_ids_by_graph(db, warehouse_id, location_ids)
    return {lid: i for i, lid in enumerate(ordered)}


__all__ = [
    "graph_ready",
    "hop_cost_m",
    "cost_from_node_to_location",
    "order_location_ids_by_graph",
    "chain_distance_m",
    "visit_index_map",
    "route_a_to_b",
    "route_between_locations",
    "is_routing_graph_configured",
]
