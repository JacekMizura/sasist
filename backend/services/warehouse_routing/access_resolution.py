"""
SSOT: WarehouseLocation → RoutingAccessPoints → RoutingNodes.

All analytics / compatibility adapters must use this module — do not re-implement
location→node mapping elsewhere. Never falls back to legacy WarehouseNode.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingNode,
)
from ...schemas.warehouse_routing import RouteComputeRequest, RouteComputeResponse
from .constants import (
    ERROR_NO_PATH,
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    OP_PACKING,
    OP_PICKING_START,
    PROCESS_PICKING,
    TRANSPORT_FOOT,
)
from .engine import route_a_to_b


@dataclass(frozen=True)
class AccessPointRef:
    uuid: str
    location_id: int
    node_uuid: str
    label: Optional[str] = None


def is_routing_graph_configured(db: Session, warehouse_id: int) -> bool:
    has_node = (
        db.query(WarehouseRoutingNode.id)
        .filter(WarehouseRoutingNode.warehouse_id == int(warehouse_id))
        .first()
        is not None
    )
    if not has_node:
        return False
    has_edge = (
        db.query(WarehouseRoutingEdge.id)
        .filter(WarehouseRoutingEdge.warehouse_id == int(warehouse_id))
        .first()
        is not None
    )
    return has_edge


def operational_node_uuid(
    db: Session,
    warehouse_id: int,
    operational_type: str,
) -> Optional[str]:
    row = (
        db.query(WarehouseRoutingNode.uuid)
        .filter(
            WarehouseRoutingNode.warehouse_id == int(warehouse_id),
            WarehouseRoutingNode.operational_type == operational_type,
        )
        .order_by(WarehouseRoutingNode.id.asc())
        .first()
    )
    return row[0] if row else None


def picking_start_node_uuid(db: Session, warehouse_id: int) -> Optional[str]:
    return operational_node_uuid(db, warehouse_id, OP_PICKING_START)


def packing_node_uuid(db: Session, warehouse_id: int) -> Optional[str]:
    return operational_node_uuid(db, warehouse_id, OP_PACKING)


def nearest_routing_node_uuid(
    db: Session,
    warehouse_id: int,
    x_cm: float,
    y_cm: float,
) -> Optional[str]:
    """Nearest authored node by Euclidean layout cm (for point→graph adapters)."""
    nodes = (
        db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == int(warehouse_id))
        .all()
    )
    if not nodes:
        return None
    best_uuid: Optional[str] = None
    best_d = float("inf")
    for n in nodes:
        dx = float(n.x) - float(x_cm)
        dy = float(n.y) - float(y_cm)
        d = dx * dx + dy * dy
        if d < best_d:
            best_d = d
            best_uuid = n.uuid
    return best_uuid


def access_points_for_location(
    db: Session,
    warehouse_id: int,
    location_id: int,
) -> list[AccessPointRef]:
    rows = (
        db.query(WarehouseRoutingAccessPoint)
        .filter(
            WarehouseRoutingAccessPoint.warehouse_id == int(warehouse_id),
            WarehouseRoutingAccessPoint.location_id == int(location_id),
        )
        .all()
    )
    return [
        AccessPointRef(
            uuid=r.uuid,
            location_id=int(r.location_id),
            node_uuid=r.node_uuid,
            label=r.label,
        )
        for r in rows
    ]


def access_node_uuids_for_location(
    db: Session,
    warehouse_id: int,
    location_id: int,
) -> list[str]:
    """Distinct routing node UUIDs reachable as access for a location (1..N)."""
    seen: set[str] = set()
    out: list[str] = []
    for ap in access_points_for_location(db, warehouse_id, location_id):
        if ap.node_uuid in seen:
            continue
        seen.add(ap.node_uuid)
        out.append(ap.node_uuid)
    return out


def access_node_uuids_for_locations(
    db: Session,
    warehouse_id: int,
    location_ids: list[int],
) -> dict[int, list[str]]:
    if not location_ids:
        return {}
    rows = (
        db.query(WarehouseRoutingAccessPoint)
        .filter(
            WarehouseRoutingAccessPoint.warehouse_id == int(warehouse_id),
            WarehouseRoutingAccessPoint.location_id.in_([int(x) for x in location_ids]),
        )
        .all()
    )
    out: dict[int, list[str]] = {int(lid): [] for lid in location_ids}
    seen: dict[int, set[str]] = {int(lid): set() for lid in location_ids}
    for r in rows:
        lid = int(r.location_id)
        if lid not in seen:
            seen[lid] = set()
            out[lid] = []
        if r.node_uuid in seen[lid]:
            continue
        seen[lid].add(r.node_uuid)
        out[lid].append(r.node_uuid)
    return out


def route_best_among_candidates(
    db: Session,
    warehouse_id: int,
    start_candidates: list[str],
    dest_candidates: list[str],
    *,
    process_type: Optional[str] = None,
    transport_type: Optional[str] = None,
) -> RouteComputeResponse:
    """
    Try all start×dest node pairs; return lowest-cost successful path.
    No legacy fallback.
    """
    if not is_routing_graph_configured(db, warehouse_id):
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            message="Brak skonfigurowanej sieci tras (authored Routing Graph).",
        )
    starts = [s for s in start_candidates if s]
    dests = [d for d in dest_candidates if d]
    if not starts or not dests:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_NO_PATH,
            message="Brak węzłów startowych lub docelowych (access points / operational).",
        )

    best: Optional[RouteComputeResponse] = None
    best_cost = float("inf")
    last_fail: Optional[RouteComputeResponse] = None
    for s in starts:
        for d in dests:
            res = route_a_to_b(
                db,
                warehouse_id,
                RouteComputeRequest(
                    start_node_uuid=s,
                    destination_node_uuid=d,
                    process_type=process_type,
                    transport_type=transport_type,
                ),
            )
            if not res.ok:
                last_fail = res
                continue
            cost = float(res.cost if res.cost is not None else res.distance_m or 0.0)
            if cost < best_cost:
                best_cost = cost
                best = res
    if best is not None:
        return best
    return last_fail or RouteComputeResponse(
        ok=False,
        error_code=ERROR_NO_PATH,
        message="Brak trasy między kandydatami access points.",
    )


def route_between_locations(
    db: Session,
    warehouse_id: int,
    from_location_id: int,
    to_location_id: int,
    *,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> RouteComputeResponse:
    starts = access_node_uuids_for_location(db, warehouse_id, from_location_id)
    dests = access_node_uuids_for_location(db, warehouse_id, to_location_id)
    return route_best_among_candidates(
        db,
        warehouse_id,
        starts,
        dests,
        process_type=process_type,
        transport_type=transport_type,
    )


def route_between_points_cm(
    db: Session,
    warehouse_id: int,
    from_x: float,
    from_y: float,
    to_x: float,
    to_y: float,
    *,
    process_type: Optional[str] = None,
    transport_type: Optional[str] = None,
) -> RouteComputeResponse:
    """Compatibility helper: snap points to nearest authored nodes, then engine A→B."""
    if not is_routing_graph_configured(db, warehouse_id):
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
            message="Brak skonfigurowanej sieci tras (authored Routing Graph).",
        )
    s = nearest_routing_node_uuid(db, warehouse_id, from_x, from_y)
    d = nearest_routing_node_uuid(db, warehouse_id, to_x, to_y)
    if not s or not d:
        return RouteComputeResponse(
            ok=False,
            error_code=ERROR_NO_PATH,
            message="Nie znaleziono węzłów sieci tras w pobliżu punktów.",
        )
    return route_a_to_b(
        db,
        warehouse_id,
        RouteComputeRequest(
            start_node_uuid=s,
            destination_node_uuid=d,
            process_type=process_type,
            transport_type=transport_type,
        ),
    )


def chain_distance_m(
    db: Session,
    warehouse_id: int,
    node_uuid_sequence: list[str],
    *,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> tuple[Optional[float], Optional[str]]:
    """
    Sum engine distances along a fixed node sequence.
    Returns (distance_m, error_code). distance_m is None when graph missing / no path.
    """
    if not node_uuid_sequence:
        return 0.0, None
    if not is_routing_graph_configured(db, warehouse_id):
        return None, ERROR_ROUTING_GRAPH_NOT_CONFIGURED
    total = 0.0
    for i in range(len(node_uuid_sequence) - 1):
        a = node_uuid_sequence[i]
        b = node_uuid_sequence[i + 1]
        if a == b:
            continue
        res = route_a_to_b(
            db,
            warehouse_id,
            RouteComputeRequest(
                start_node_uuid=a,
                destination_node_uuid=b,
                process_type=process_type,
                transport_type=transport_type,
            ),
        )
        if not res.ok:
            return None, res.error_code or ERROR_NO_PATH
        total += float(res.distance_m or 0.0)
    return round(total, 4), None


def chain_distance_through_location_ids(
    db: Session,
    warehouse_id: int,
    location_ids_in_order: list[int],
    *,
    start_node_uuid: Optional[str] = None,
    end_node_uuid: Optional[str] = None,
    process_type: Optional[str] = PROCESS_PICKING,
    transport_type: Optional[str] = TRANSPORT_FOOT,
) -> tuple[Optional[float], Optional[str], list[str]]:
    """
    Walk start → loc1 → loc2 → … → end choosing best access node at each hop.
    Returns (distance_m|None, error_code|None, chosen_node_uuid_path).
    """
    if not is_routing_graph_configured(db, warehouse_id):
        return None, ERROR_ROUTING_GRAPH_NOT_CONFIGURED, []

    loc_nodes = access_node_uuids_for_locations(db, warehouse_id, location_ids_in_order)
    path_nodes: list[str] = []
    cursor: Optional[str] = start_node_uuid
    if cursor:
        path_nodes.append(cursor)

    total = 0.0
    for lid in location_ids_in_order:
        candidates = loc_nodes.get(int(lid), [])
        if not candidates:
            return None, ERROR_NO_PATH, path_nodes
        if cursor is None:
            # First stop without explicit start: pick any candidate as position
            cursor = candidates[0]
            path_nodes.append(cursor)
            continue
        res = route_best_among_candidates(
            db,
            warehouse_id,
            [cursor],
            candidates,
            process_type=process_type,
            transport_type=transport_type,
        )
        if not res.ok or not res.nodes:
            return None, res.error_code or ERROR_NO_PATH, path_nodes
        total += float(res.distance_m or 0.0)
        cursor = res.nodes[-1].node_uuid
        path_nodes.append(cursor)

    if end_node_uuid and cursor:
        if cursor != end_node_uuid:
            res = route_a_to_b(
                db,
                warehouse_id,
                RouteComputeRequest(
                    start_node_uuid=cursor,
                    destination_node_uuid=end_node_uuid,
                    process_type=process_type,
                    transport_type=transport_type,
                ),
            )
            if not res.ok:
                return None, res.error_code or ERROR_NO_PATH, path_nodes
            total += float(res.distance_m or 0.0)
            path_nodes.append(end_node_uuid)

    return round(total, 4), None, path_nodes
