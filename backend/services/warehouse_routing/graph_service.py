"""Persistence for authored Warehouse Routing Graph (stable UUID replace)."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingNode,
)
from ...schemas.warehouse_routing import (
    RoutingAccessPointOut,
    RoutingEdgeOut,
    RoutingGraphOut,
    RoutingGraphReplaceRequest,
    RoutingNodeOut,
)
from .constants import (
    DIRECTIONS,
    ERROR_FOREIGN_LOCATION,
    ERROR_OVERLAPPING_EDGES,
    NODE_TYPES,
    OPERATIONAL_TYPES,
    RoutingGraphValidationError,
    RoutingGraphVersionConflict,
)
from .geometry import distance_m_between_cm, segments_overlap_collinear
from .intersection import materialize_intersections


def _json_dumps(data: Any) -> Optional[str]:
    if data is None:
        return None
    return json.dumps(data, ensure_ascii=False)


def _json_loads(raw: Optional[str]) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw)
    except Exception:
        return None


def _get_or_create_meta(db: Session, warehouse_id: int) -> WarehouseRoutingGraphMeta:
    meta = db.query(WarehouseRoutingGraphMeta).filter_by(warehouse_id=int(warehouse_id)).first()
    if meta is None:
        meta = WarehouseRoutingGraphMeta(warehouse_id=int(warehouse_id), revision=1, updated_at=datetime.utcnow())
        db.add(meta)
        db.flush()
    return meta


def _node_out(n: WarehouseRoutingNode) -> RoutingNodeOut:
    return RoutingNodeOut(
        uuid=n.uuid,
        warehouse_id=int(n.warehouse_id),
        layout_id=n.layout_id,
        x=float(n.x),
        y=float(n.y),
        node_type=n.node_type or "junction",
        operational_type=n.operational_type,
        label=n.label,
        meta=_json_loads(n.meta_json),
    )


def _edge_out(e: WarehouseRoutingEdge) -> RoutingEdgeOut:
    procs = _json_loads(e.allowed_processes_json) or []
    transports = _json_loads(e.allowed_transport_types_json) or []
    return RoutingEdgeOut(
        uuid=e.uuid,
        warehouse_id=int(e.warehouse_id),
        layout_id=e.layout_id,
        from_node_uuid=e.from_node_uuid,
        to_node_uuid=e.to_node_uuid,
        distance_m=float(e.distance_m or 0),
        direction=(e.direction or "BOTH").upper(),
        enabled=bool(e.enabled),
        allowed_processes=list(procs) if isinstance(procs, list) else [],
        allowed_transport_types=list(transports) if isinstance(transports, list) else [],
        cost_multiplier=float(e.cost_multiplier if e.cost_multiplier is not None else 1.0),
        label=e.label,
        meta=_json_loads(e.meta_json),
    )


def _ap_out(a: WarehouseRoutingAccessPoint) -> RoutingAccessPointOut:
    return RoutingAccessPointOut(
        uuid=a.uuid,
        warehouse_id=int(a.warehouse_id),
        location_id=int(a.location_id),
        node_uuid=a.node_uuid,
        label=a.label,
        meta=_json_loads(a.meta_json),
    )


def get_graph(db: Session, warehouse_id: int) -> RoutingGraphOut:
    wid = int(warehouse_id)
    nodes = db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == wid).all()
    edges = db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.warehouse_id == wid).all()
    aps = (
        db.query(WarehouseRoutingAccessPoint)
        .filter(WarehouseRoutingAccessPoint.warehouse_id == wid)
        .all()
    )
    meta = db.query(WarehouseRoutingGraphMeta).filter_by(warehouse_id=wid).first()
    revision = int(meta.revision) if meta else 1
    layout_id = None
    if nodes:
        layout_id = nodes[0].layout_id
    elif edges:
        layout_id = edges[0].layout_id
    return RoutingGraphOut(
        warehouse_id=wid,
        layout_id=layout_id,
        revision=revision,
        nodes=[_node_out(n) for n in nodes],
        edges=[_edge_out(e) for e in edges],
        access_points=[_ap_out(a) for a in aps],
        configured=bool(nodes),
    )


def _reject_overlapping_edges(node_dicts: list[dict[str, Any]], edge_dicts: list[dict[str, Any]]) -> None:
    by_uuid = {n["uuid"]: n for n in node_dicts}
    for i in range(len(edge_dicts)):
        for j in range(i + 1, len(edge_dicts)):
            e1, e2 = edge_dicts[i], edge_dicts[j]
            shared = {e1["from_node_uuid"], e1["to_node_uuid"]} & {
                e2["from_node_uuid"],
                e2["to_node_uuid"],
            }
            # Identical endpoint pair (duplicate edge)
            if len(shared) == 2:
                raise RoutingGraphValidationError(
                    ERROR_OVERLAPPING_EDGES,
                    "Zduplikowane odcinki między tymi samymi punktami tras — usuń jeden.",
                )
            n1a, n1b = by_uuid.get(e1["from_node_uuid"]), by_uuid.get(e1["to_node_uuid"])
            n2a, n2b = by_uuid.get(e2["from_node_uuid"]), by_uuid.get(e2["to_node_uuid"])
            if not n1a or not n1b or not n2a or not n2b:
                continue
            if segments_overlap_collinear(
                (float(n1a["x"]), float(n1a["y"])),
                (float(n1b["x"]), float(n1b["y"])),
                (float(n2a["x"]), float(n2a["y"])),
                (float(n2b["x"]), float(n2b["y"])),
            ):
                raise RoutingGraphValidationError(
                    ERROR_OVERLAPPING_EDGES,
                    "Odcinki tras nakładają się (współliniowe) — to niejednoznaczna geometria. "
                    "Rozdziel je lub połącz w skrzyżowanie.",
                )


def replace_graph(
    db: Session,
    warehouse_id: int,
    payload: RoutingGraphReplaceRequest,
    *,
    materialize_crossings: bool = True,
) -> RoutingGraphOut:
    """
    Replace entire authored graph for warehouse in one transaction.
    Preserves client UUIDs (stable identity across save/reload).
    Physical distance_m is ALWAYS recomputed from node x/y (cm→m); cost_multiplier is separate.
    Does NOT touch warehouse layout / legacy WarehouseNode.
    """
    wid = int(warehouse_id)
    meta = _get_or_create_meta(db, wid)
    expected = payload.expected_revision
    if expected is not None and int(expected) != int(meta.revision):
        raise RoutingGraphVersionConflict(int(meta.revision))

    try:
        node_dicts = [
            {
                "uuid": str(n.uuid).strip(),
                "x": float(n.x),
                "y": float(n.y),
                "node_type": (n.node_type or "junction").strip() or "junction",
                "operational_type": n.operational_type,
                "label": n.label,
                "meta": n.meta,
            }
            for n in payload.nodes
            if str(n.uuid).strip()
        ]
        edge_dicts = [
            {
                "uuid": str(e.uuid).strip(),
                "from_node_uuid": str(e.from_node_uuid).strip(),
                "to_node_uuid": str(e.to_node_uuid).strip(),
                "distance_m": None,  # always recomputed from geometry
                "direction": (e.direction or "BOTH").upper(),
                "enabled": bool(e.enabled),
                "allowed_processes": list(e.allowed_processes or []),
                "allowed_transport_types": list(e.allowed_transport_types or []),
                "cost_multiplier": float(e.cost_multiplier if e.cost_multiplier is not None else 1.0),
                "label": e.label,
                "meta": e.meta,
            }
            for e in payload.edges
            if str(e.uuid).strip()
        ]

        # Reject ambiguous overlapping geometry before materialization
        _reject_overlapping_edges(node_dicts, edge_dicts)

        if materialize_crossings and edge_dicts:
            node_dicts, edge_dicts = materialize_intersections(node_dicts, edge_dicts)

        for n in node_dicts:
            if n["node_type"] not in NODE_TYPES:
                n["node_type"] = "junction"
            ot = n.get("operational_type")
            if ot and ot not in OPERATIONAL_TYPES:
                n["operational_type"] = None
            if n.get("operational_type") and n["node_type"] == "junction":
                n["node_type"] = "operational"

        node_uuids = {n["uuid"] for n in node_dicts}
        valid_edges = []
        by_uuid = {n["uuid"]: n for n in node_dicts}
        for e in edge_dicts:
            if e["from_node_uuid"] not in node_uuids or e["to_node_uuid"] not in node_uuids:
                continue
            if e["from_node_uuid"] == e["to_node_uuid"]:
                continue
            if e["direction"] not in DIRECTIONS:
                e["direction"] = "BOTH"
            a = by_uuid[e["from_node_uuid"]]
            b = by_uuid[e["to_node_uuid"]]
            # SSOT: physical distance from coordinates only
            e["distance_m"] = distance_m_between_cm(a["x"], a["y"], b["x"], b["y"])
            valid_edges.append(e)

        # Second pass: overlaps after materialization (should be none if only proper crosses)
        _reject_overlapping_edges(node_dicts, valid_edges)

        # Warehouse-scoped location allow-list
        valid_loc_ids = {
            int(r[0])
            for r in db.query(Location.id).filter(Location.warehouse_id == wid).all()
        }

        db.query(WarehouseRoutingAccessPoint).filter(
            WarehouseRoutingAccessPoint.warehouse_id == wid
        ).delete(synchronize_session=False)
        db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.warehouse_id == wid).delete(
            synchronize_session=False
        )
        db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == wid).delete(
            synchronize_session=False
        )
        db.flush()

        layout_id = payload.layout_id
        for n in node_dicts:
            db.add(
                WarehouseRoutingNode(
                    uuid=n["uuid"],
                    warehouse_id=wid,
                    layout_id=layout_id,
                    x=float(n["x"]),
                    y=float(n["y"]),
                    node_type=n["node_type"],
                    operational_type=n.get("operational_type"),
                    label=n.get("label"),
                    meta_json=_json_dumps(n.get("meta")),
                )
            )
        for e in valid_edges:
            db.add(
                WarehouseRoutingEdge(
                    uuid=e["uuid"],
                    warehouse_id=wid,
                    layout_id=layout_id,
                    from_node_uuid=e["from_node_uuid"],
                    to_node_uuid=e["to_node_uuid"],
                    distance_m=float(e["distance_m"]),
                    direction=e["direction"],
                    enabled=bool(e.get("enabled", True)),
                    allowed_processes_json=_json_dumps(e.get("allowed_processes") or []),
                    allowed_transport_types_json=_json_dumps(e.get("allowed_transport_types") or []),
                    cost_multiplier=float(e.get("cost_multiplier") or 1.0),
                    label=e.get("label"),
                    meta_json=_json_dumps(e.get("meta")),
                )
            )

        # Access points: 1..N per location; reject foreign warehouse locations
        seen_triple: set[tuple[int, str]] = set()
        for ap in payload.access_points:
            loc_id = int(ap.location_id)
            node_uuid = str(ap.node_uuid).strip()
            if loc_id not in valid_loc_ids:
                raise RoutingGraphValidationError(
                    ERROR_FOREIGN_LOCATION,
                    f"Lokalizacja {loc_id} nie należy do magazynu {wid}.",
                )
            if node_uuid not in node_uuids:
                continue
            key = (loc_id, node_uuid)
            if key in seen_triple:
                continue
            seen_triple.add(key)
            db.add(
                WarehouseRoutingAccessPoint(
                    uuid=str(ap.uuid).strip() or str(uuid4()),
                    warehouse_id=wid,
                    location_id=loc_id,
                    node_uuid=node_uuid,
                    label=ap.label,
                    meta_json=_json_dumps(ap.meta),
                )
            )

        meta.revision = int(meta.revision) + 1
        meta.updated_at = datetime.utcnow()
        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_graph(db, wid)
