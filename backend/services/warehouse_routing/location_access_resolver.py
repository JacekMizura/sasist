"""AUTO Location Access resolver — face-aware edge+t binding (no permanent access nodes)."""

from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse import Rack, WarehouseLayout
from ...models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingLocationAccess,
    WarehouseRoutingNode,
)
from .location_access_geometry import (
    DEFAULT_MAX_ACCESS_REACH_M,
    rack_footprint_cm,
    select_best_edge_for_service_point,
    service_edge_point_cm,
    world_service_normal,
)
from .location_rack_link import resolve_location_rack_link, resolve_racks_for_locations

BINDING_AUTO = "AUTO"
BINDING_MANUAL_OVERRIDE = "MANUAL_OVERRIDE"

STATUS_OK = "OK"
STATUS_REVIEW = "REVIEW"
STATUS_UNREACHABLE = "UNREACHABLE"
STATUS_NO_RACK = "NO_RACK"
STATUS_NO_GRAPH = "NO_GRAPH"
STATUS_LEGACY_NODE = "LEGACY_NODE"


@dataclass
class ResolveResult:
    location_id: int
    binding_mode: str
    status: str
    edge_uuid: Optional[str] = None
    t: Optional[float] = None
    service_point_x_cm: Optional[float] = None
    service_point_y_cm: Optional[float] = None
    entry_x_cm: Optional[float] = None
    entry_y_cm: Optional[float] = None
    access_approach_m: Optional[float] = None
    rack_id: Optional[int] = None
    rack_uuid: Optional[str] = None
    legacy_node_uuid: Optional[str] = None


def _layout_fingerprint(db: Session, warehouse_id: int) -> str:
    layout = (
        db.query(WarehouseLayout)
        .filter(WarehouseLayout.warehouse_id == int(warehouse_id))
        .order_by(WarehouseLayout.id.desc())
        .first()
    )
    if not layout:
        return "no-layout"
    racks = (
        db.query(Rack.id, Rack.uuid, Rack.x, Rack.y, Rack.width, Rack.height, Rack.orientation, Rack.service_side, Rack.rotation_degrees)
        .filter(Rack.layout_id == layout.id, Rack.is_active.is_(True))
        .order_by(Rack.id.asc())
        .all()
    )
    payload = {
        "layout_id": layout.id,
        "racks": [
            {
                "id": r[0],
                "uuid": r[1],
                "x": r[2],
                "y": r[3],
                "w": r[4],
                "h": r[5],
                "o": r[6],
                "side": r[7],
                "rot": r[8],
            }
            for r in racks
        ],
    }
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def _graph_revision(db: Session, warehouse_id: int) -> int:
    meta = (
        db.query(WarehouseRoutingGraphMeta)
        .filter(WarehouseRoutingGraphMeta.warehouse_id == int(warehouse_id))
        .first()
    )
    return int(meta.revision) if meta else 0


def _edge_geometry(
    db: Session, warehouse_id: int
) -> list[tuple[str, tuple[float, float], tuple[float, float]]]:
    edges = (
        db.query(WarehouseRoutingEdge)
        .filter(
            WarehouseRoutingEdge.warehouse_id == int(warehouse_id),
            WarehouseRoutingEdge.enabled.is_(True),
        )
        .all()
    )
    nodes = {
        n.uuid: n
        for n in db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == int(warehouse_id))
        .all()
    }
    out: list[tuple[str, tuple[float, float], tuple[float, float]]] = []
    for e in edges:
        a = nodes.get(e.from_node_uuid)
        b = nodes.get(e.to_node_uuid)
        if not a or not b:
            continue
        out.append((e.uuid, (float(a.x), float(a.y)), (float(b.x), float(b.y))))
    return out


def resolve_auto_for_location(
    db: Session,
    warehouse_id: int,
    location: Location,
    *,
    rack: Optional[Rack] = None,
    edges: Optional[list[tuple[str, tuple[float, float], tuple[float, float]]]] = None,
    max_reach_m: float = DEFAULT_MAX_ACCESS_REACH_M,
) -> ResolveResult:
    lid = int(location.id)
    link = resolve_location_rack_link(db, location)
    if link is None and rack is None:
        return ResolveResult(location_id=lid, binding_mode=BINDING_AUTO, status=STATUS_NO_RACK)
    if rack is None:
        rack = db.query(Rack).filter(Rack.id == link.rack_id).first()  # type: ignore[union-attr]
    if rack is None:
        return ResolveResult(location_id=lid, binding_mode=BINDING_AUTO, status=STATUS_NO_RACK)

    cx = getattr(location, "x", None)
    cy = getattr(location, "y", None)
    if cx is None or cy is None:
        return ResolveResult(
            location_id=lid,
            binding_mode=BINDING_AUTO,
            status=STATUS_REVIEW,
            rack_id=int(rack.id),
            rack_uuid=getattr(rack, "uuid", None),
        )

    edge_list = edges if edges is not None else _edge_geometry(db, warehouse_id)
    if not edge_list:
        return ResolveResult(
            location_id=lid,
            binding_mode=BINDING_AUTO,
            status=STATUS_NO_GRAPH,
            rack_id=int(rack.id),
            rack_uuid=getattr(rack, "uuid", None),
        )

    S = service_edge_point_cm(rack, float(cx), float(cy))
    n = world_service_normal(rack)
    fp = rack_footprint_cm(rack)
    best = select_best_edge_for_service_point(S, n, fp, edge_list, max_reach_m=max_reach_m)
    if best is None:
        return ResolveResult(
            location_id=lid,
            binding_mode=BINDING_AUTO,
            status=STATUS_UNREACHABLE,
            service_point_x_cm=S.x,
            service_point_y_cm=S.y,
            rack_id=int(rack.id),
            rack_uuid=getattr(rack, "uuid", None),
        )

    status = STATUS_OK
    if best.orthogonality > 0.35 or best.approach_m > max_reach_m * 0.75:
        status = STATUS_REVIEW

    return ResolveResult(
        location_id=lid,
        binding_mode=BINDING_AUTO,
        status=status,
        edge_uuid=best.edge_uuid,
        t=best.t,
        service_point_x_cm=S.x,
        service_point_y_cm=S.y,
        entry_x_cm=best.entry.x,
        entry_y_cm=best.entry.y,
        access_approach_m=best.approach_m,
        rack_id=int(rack.id),
        rack_uuid=getattr(rack, "uuid", None),
    )


def _upsert_row(
    db: Session,
    warehouse_id: int,
    result: ResolveResult,
    *,
    graph_revision: int,
    layout_fingerprint: str,
    existing: Optional[WarehouseRoutingLocationAccess] = None,
) -> WarehouseRoutingLocationAccess:
    row = existing
    if row is None:
        row = (
            db.query(WarehouseRoutingLocationAccess)
            .filter(
                WarehouseRoutingLocationAccess.warehouse_id == int(warehouse_id),
                WarehouseRoutingLocationAccess.location_id == result.location_id,
            )
            .first()
        )
    if row is None:
        row = WarehouseRoutingLocationAccess(
            uuid=str(uuid.uuid4()),
            warehouse_id=int(warehouse_id),
            location_id=result.location_id,
        )
        db.add(row)

    # Never overwrite MANUAL_OVERRIDE with AUTO recompute unless caller forced existing.binding_mode
    if (
        row.binding_mode == BINDING_MANUAL_OVERRIDE
        and result.binding_mode == BINDING_AUTO
        and (existing is None or existing.binding_mode == BINDING_MANUAL_OVERRIDE)
    ):
        # Keep override; only refresh fingerprint metadata
        row.graph_revision = graph_revision
        row.layout_fingerprint = layout_fingerprint
        return row

    row.binding_mode = result.binding_mode
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
    if result.legacy_node_uuid is not None:
        row.legacy_node_uuid = result.legacy_node_uuid
    elif result.binding_mode == BINDING_AUTO:
        row.legacy_node_uuid = None
    row.graph_revision = graph_revision
    row.layout_fingerprint = layout_fingerprint
    return row


def migrate_access_points_to_overrides(db: Session, warehouse_id: int) -> int:
    """
    Copy existing WarehouseRoutingAccessPoint rows into MANUAL_OVERRIDE bindings.
    Does not delete APs (Stage-2 consumers still read them until Stage 3).
    """
    wid = int(warehouse_id)
    aps = (
        db.query(WarehouseRoutingAccessPoint)
        .filter(WarehouseRoutingAccessPoint.warehouse_id == wid)
        .all()
    )
    if not aps:
        return 0
    # One override per location — keep first AP by id
    by_loc: dict[int, WarehouseRoutingAccessPoint] = {}
    for ap in sorted(aps, key=lambda a: int(a.id)):
        lid = int(ap.location_id)
        if lid not in by_loc:
            by_loc[lid] = ap

    nodes = {
        n.uuid: n
        for n in db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == wid)
        .all()
    }
    fp = _layout_fingerprint(db, wid)
    rev = _graph_revision(db, wid)
    created = 0
    for lid, ap in by_loc.items():
        existing = (
            db.query(WarehouseRoutingLocationAccess)
            .filter(
                WarehouseRoutingLocationAccess.warehouse_id == wid,
                WarehouseRoutingLocationAccess.location_id == lid,
            )
            .first()
        )
        if existing and existing.binding_mode == BINDING_MANUAL_OVERRIDE:
            continue
        node = nodes.get(ap.node_uuid)
        result = ResolveResult(
            location_id=lid,
            binding_mode=BINDING_MANUAL_OVERRIDE,
            status=STATUS_LEGACY_NODE,
            legacy_node_uuid=ap.node_uuid,
            entry_x_cm=float(node.x) if node else None,
            entry_y_cm=float(node.y) if node else None,
            access_approach_m=0.0,
        )
        _upsert_row(db, wid, result, graph_revision=rev, layout_fingerprint=fp, existing=existing)
        created += 1
    if created:
        db.flush()
    return created


def recompute_location_access(
    db: Session,
    warehouse_id: int,
    *,
    max_reach_m: float = DEFAULT_MAX_ACCESS_REACH_M,
    migrate_aps: bool = True,
) -> dict:
    """Recompute AUTO bindings for all active locations; preserve MANUAL_OVERRIDE."""
    wid = int(warehouse_id)
    if migrate_aps:
        migrate_access_points_to_overrides(db, wid)

    locations = (
        db.query(Location)
        .filter(Location.warehouse_id == wid, Location.is_active.is_(True))
        .all()
    )
    links = resolve_racks_for_locations(db, locations)
    racks = {
        r.id: r
        for r in db.query(Rack)
        .filter(Rack.id.in_([lnk.rack_id for lnk in links.values()] or [-1]))
        .all()
    }
    edges = _edge_geometry(db, wid)
    fp = _layout_fingerprint(db, wid)
    rev = _graph_revision(db, wid)

    counts = {
        STATUS_OK: 0,
        STATUS_REVIEW: 0,
        STATUS_UNREACHABLE: 0,
        STATUS_NO_RACK: 0,
        STATUS_NO_GRAPH: 0,
        STATUS_LEGACY_NODE: 0,
        "MANUAL_OVERRIDE": 0,
        "AUTO": 0,
    }

    existing_rows = {
        int(r.location_id): r
        for r in db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.warehouse_id == wid)
        .all()
    }

    for loc in locations:
        lid = int(loc.id)
        existing = existing_rows.get(lid)
        if existing and existing.binding_mode == BINDING_MANUAL_OVERRIDE:
            counts["MANUAL_OVERRIDE"] += 1
            counts[STATUS_LEGACY_NODE if existing.status == STATUS_LEGACY_NODE else existing.status] = (
                counts.get(existing.status, 0) + 1
            )
            continue
        link = links.get(lid)
        rack = racks.get(link.rack_id) if link else None
        result = resolve_auto_for_location(
            db, wid, loc, rack=rack, edges=edges, max_reach_m=max_reach_m
        )
        _upsert_row(db, wid, result, graph_revision=rev, layout_fingerprint=fp, existing=existing)
        counts["AUTO"] += 1
        counts[result.status] = counts.get(result.status, 0) + 1

    db.flush()
    return {
        "warehouse_id": wid,
        "locations_total": len(locations),
        "graph_revision": rev,
        "layout_fingerprint": fp,
        "counts": counts,
    }


def location_access_summary(db: Session, warehouse_id: int) -> dict:
    wid = int(warehouse_id)
    rows = (
        db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.warehouse_id == wid)
        .all()
    )
    by_status: dict[str, int] = {}
    by_mode: dict[str, int] = {}
    for r in rows:
        by_status[r.status] = by_status.get(r.status, 0) + 1
        by_mode[r.binding_mode] = by_mode.get(r.binding_mode, 0) + 1
    return {
        "warehouse_id": wid,
        "total": len(rows),
        "by_status": by_status,
        "by_mode": by_mode,
    }
