"""Location Access service — override / restore / list bindings."""

from __future__ import annotations

import uuid
from typing import Optional

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse_routing import WarehouseRoutingLocationAccess, WarehouseRoutingNode
from .location_access_geometry import DEFAULT_MAX_ACCESS_REACH_M, project_point_to_segment
from .location_access_resolver import (
    BINDING_AUTO,
    BINDING_MANUAL_OVERRIDE,
    STATUS_LEGACY_NODE,
    STATUS_OK,
    STATUS_UNREACHABLE,
    _edge_geometry,
    _graph_revision,
    _layout_fingerprint,
    _upsert_row,
    recompute_location_access,
    resolve_auto_for_location,
    ResolveResult,
)


def list_location_access(db: Session, warehouse_id: int) -> list[WarehouseRoutingLocationAccess]:
    return (
        db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.warehouse_id == int(warehouse_id))
        .order_by(WarehouseRoutingLocationAccess.location_id.asc())
        .all()
    )


def get_location_access(
    db: Session, warehouse_id: int, location_id: int
) -> Optional[WarehouseRoutingLocationAccess]:
    return (
        db.query(WarehouseRoutingLocationAccess)
        .filter(
            WarehouseRoutingLocationAccess.warehouse_id == int(warehouse_id),
            WarehouseRoutingLocationAccess.location_id == int(location_id),
        )
        .first()
    )


def set_manual_override(
    db: Session,
    warehouse_id: int,
    location_id: int,
    *,
    edge_uuid: Optional[str] = None,
    t: Optional[float] = None,
    node_uuid: Optional[str] = None,
) -> WarehouseRoutingLocationAccess:
    """
    Manual exception: bind to edge+t, or legacy node (Stage-2 compatible).
    """
    wid = int(warehouse_id)
    lid = int(location_id)
    loc = (
        db.query(Location)
        .filter(Location.id == lid, Location.warehouse_id == wid)
        .first()
    )
    if loc is None:
        raise ValueError("Lokalizacja nie istnieje w tym magazynie.")

    fp = _layout_fingerprint(db, wid)
    rev = _graph_revision(db, wid)
    existing = get_location_access(db, wid, lid)

    if node_uuid:
        node = (
            db.query(WarehouseRoutingNode)
            .filter(
                WarehouseRoutingNode.warehouse_id == wid,
                WarehouseRoutingNode.uuid == node_uuid,
            )
            .first()
        )
        if node is None:
            raise ValueError("Punkt trasy nie istnieje.")
        result = ResolveResult(
            location_id=lid,
            binding_mode=BINDING_MANUAL_OVERRIDE,
            status=STATUS_LEGACY_NODE,
            legacy_node_uuid=node_uuid,
            entry_x_cm=float(node.x),
            entry_y_cm=float(node.y),
            access_approach_m=0.0,
            service_point_x_cm=float(loc.x) if loc.x is not None else None,
            service_point_y_cm=float(loc.y) if loc.y is not None else None,
        )
        return _upsert_row(db, wid, result, graph_revision=rev, layout_fingerprint=fp, existing=existing)

    if not edge_uuid or t is None:
        raise ValueError("Podaj edge_uuid + t albo node_uuid.")

    edges = {e[0]: e for e in _edge_geometry(db, wid)}
    if edge_uuid not in edges:
        raise ValueError("Odcinek trasy nie istnieje.")
    _, a, b = edges[edge_uuid]
    t_clamped = max(0.0, min(1.0, float(t)))
    entry_x = a[0] + (b[0] - a[0]) * t_clamped
    entry_y = a[1] + (b[1] - a[1]) * t_clamped
    sx = float(loc.x) if loc.x is not None else entry_x
    sy = float(loc.y) if loc.y is not None else entry_y
    _, _, approach = project_point_to_segment(sx, sy, a[0], a[1], b[0], b[1])
    # Use exact t point for approach from service approx
    from .geometry import distance_m_between_cm

    approach = distance_m_between_cm(sx, sy, entry_x, entry_y)

    result = ResolveResult(
        location_id=lid,
        binding_mode=BINDING_MANUAL_OVERRIDE,
        status=STATUS_OK if approach < DEFAULT_MAX_ACCESS_REACH_M else STATUS_UNREACHABLE,
        edge_uuid=edge_uuid,
        t=t_clamped,
        service_point_x_cm=sx,
        service_point_y_cm=sy,
        entry_x_cm=entry_x,
        entry_y_cm=entry_y,
        access_approach_m=approach,
    )
    row = _upsert_row(db, wid, result, graph_revision=rev, layout_fingerprint=fp, existing=existing)
    db.flush()
    return row


def restore_auto(
    db: Session,
    warehouse_id: int,
    location_id: int,
    *,
    max_reach_m: float = DEFAULT_MAX_ACCESS_REACH_M,
) -> WarehouseRoutingLocationAccess:
    wid = int(warehouse_id)
    lid = int(location_id)
    loc = (
        db.query(Location)
        .filter(Location.id == lid, Location.warehouse_id == wid)
        .first()
    )
    if loc is None:
        raise ValueError("Lokalizacja nie istnieje w tym magazynie.")
    result = resolve_auto_for_location(db, wid, loc, max_reach_m=max_reach_m)
    row = get_location_access(db, wid, lid)
    if row is None:
        row = WarehouseRoutingLocationAccess(
            uuid=str(uuid.uuid4()),
            warehouse_id=wid,
            location_id=lid,
        )
        db.add(row)
    row.binding_mode = BINDING_AUTO
    row.status = result.status
    row.edge_uuid = result.edge_uuid
    row.t = result.t
    row.service_point_x_cm = result.service_point_x_cm
    row.service_point_y_cm = result.service_point_y_cm
    row.entry_x_cm = result.entry_x_cm
    row.entry_y_cm = result.entry_y_cm
    row.access_approach_m = result.access_approach_m
    row.rack_id = result.rack_id
    row.rack_uuid = result.rack_uuid
    row.legacy_node_uuid = None
    row.graph_revision = _graph_revision(db, wid)
    row.layout_fingerprint = _layout_fingerprint(db, wid)
    db.flush()
    return row


def ensure_recomputed(db: Session, warehouse_id: int) -> dict:
    return recompute_location_access(db, warehouse_id)
