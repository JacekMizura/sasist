"""Validation for authored Warehouse Routing Graph — human-readable PL messages (no UUID spam)."""

from __future__ import annotations

from collections import defaultdict, deque

from sqlalchemy.orm import Session

from ...models.location import Location
from ...models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingNode,
)
from ...schemas.warehouse_routing import RoutingValidationResult, ValidationIssue
from .constants import (
    DIRECTION_BACKWARD,
    DIRECTION_BOTH,
    DIRECTION_FORWARD,
    OP_PACKING,
    OP_PICKING_START,
)


def _weak_undirected_adj(edges: list[WarehouseRoutingEdge]) -> dict[str, set[str]]:
    adj: dict[str, set[str]] = defaultdict(set)
    for e in edges:
        if not e.enabled:
            continue
        adj[e.from_node_uuid].add(e.to_node_uuid)
        adj[e.to_node_uuid].add(e.from_node_uuid)
    return adj


def _directed_adj(edges: list[WarehouseRoutingEdge]) -> dict[str, set[str]]:
    adj: dict[str, set[str]] = defaultdict(set)
    for e in edges:
        if not e.enabled:
            continue
        d = (e.direction or DIRECTION_BOTH).upper()
        if d == DIRECTION_BOTH:
            adj[e.from_node_uuid].add(e.to_node_uuid)
            adj[e.to_node_uuid].add(e.from_node_uuid)
        elif d == DIRECTION_FORWARD:
            adj[e.from_node_uuid].add(e.to_node_uuid)
        elif d == DIRECTION_BACKWARD:
            adj[e.to_node_uuid].add(e.from_node_uuid)
        else:
            adj[e.from_node_uuid].add(e.to_node_uuid)
            adj[e.to_node_uuid].add(e.from_node_uuid)
    return adj


def _reachable(adj: dict[str, set[str]], start: str, goals: set[str]) -> bool:
    if start in goals:
        return True
    seen = {start}
    q = deque([start])
    while q:
        u = q.popleft()
        for v in adj.get(u, ()):
            if v in seen:
                continue
            if v in goals:
                return True
            seen.add(v)
            q.append(v)
    return False


def validate_graph(db: Session, warehouse_id: int) -> RoutingValidationResult:
    wid = int(warehouse_id)
    issues: list[ValidationIssue] = []

    nodes = db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == wid).all()
    edges = db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.warehouse_id == wid).all()
    aps = (
        db.query(WarehouseRoutingAccessPoint)
        .filter(WarehouseRoutingAccessPoint.warehouse_id == wid)
        .all()
    )

    if not nodes:
        issues.append(
            ValidationIssue(
                code="GRAPH_EMPTY",
                severity="error",
                message="Nie narysowano jeszcze żadnej trasy. Wybierz „Rysuj trasę” i połącz punkty na mapie.",
            )
        )
        return RoutingValidationResult(ok=False, issues=issues)

    node_uuids = {n.uuid for n in nodes}
    weak = _weak_undirected_adj(edges)
    directed = _directed_adj(edges)

    if not edges:
        orphan_ids = [n.uuid for n in nodes]
        issues.append(
            ValidationIssue(
                code="NO_EDGES",
                severity="error",
                message=(
                    f"Na mapie są punkty ({len(nodes)}), ale nie tworzą jeszcze trasy. "
                    "Połącz je narzędziem „Rysuj trasę” albo usuń niepotrzebne punkty."
                ),
                ref_uuids=orphan_ids,
            )
        )
    else:
        orphan_ids = [n.uuid for n in nodes if n.uuid not in weak or not weak[n.uuid]]
        if orphan_ids:
            n = len(orphan_ids)
            msg = (
                "1 punkt nie jest połączony z żadną trasą."
                if n == 1
                else f"{n} punktów nie jest połączonych z żadną trasą."
            )
            issues.append(
                ValidationIssue(
                    code="ORPHAN_NODES",
                    severity="warning",
                    message=msg,
                    ref_uuids=orphan_ids,
                )
            )

    for e in edges:
        if e.from_node_uuid not in node_uuids or e.to_node_uuid not in node_uuids:
            issues.append(
                ValidationIssue(
                    code="INVALID_EDGE",
                    severity="error",
                    message="Jeden z odcinków trasy wskazuje nieistniejący punkt.",
                    ref_uuid=e.uuid,
                )
            )
        if e.from_node_uuid == e.to_node_uuid:
            issues.append(
                ValidationIssue(
                    code="INVALID_EDGE",
                    severity="error",
                    message="Jeden z odcinków łączy punkt sam ze sobą.",
                    ref_uuid=e.uuid,
                )
            )
        if e.cost_multiplier is not None and float(e.cost_multiplier) <= 0:
            issues.append(
                ValidationIssue(
                    code="INVALID_EDGE",
                    severity="warning",
                    message="Mnożnik kosztu odcinka musi być większy od zera.",
                    ref_uuid=e.uuid,
                )
            )

    connected_nodes = [n.uuid for n in nodes if n.uuid in weak and weak[n.uuid]]
    if connected_nodes:
        start = connected_nodes[0]
        seen: set[str] = set()
        q = deque([start])
        seen.add(start)
        while q:
            u = q.popleft()
            for v in weak.get(u, ()):
                if v not in seen:
                    seen.add(v)
                    q.append(v)
        unreachable = [uid for uid in connected_nodes if uid not in seen]
        if unreachable:
            issues.append(
                ValidationIssue(
                    code="DISCONNECTED_GRAPH",
                    severity="error",
                    message="Część sieci tras nie jest ze sobą połączona.",
                    ref_uuids=unreachable,
                )
            )

    starts = [n for n in nodes if n.operational_type == OP_PICKING_START]
    packs = [n for n in nodes if n.operational_type == OP_PACKING]
    if not starts:
        issues.append(
            ValidationIssue(
                code="MISSING_PICKING_START",
                severity="error",
                message="Nie ustawiono punktu rozpoczęcia pracy (Start pracy).",
            )
        )
    if not packs:
        issues.append(
            ValidationIssue(
                code="MISSING_PACKING",
                severity="error",
                message="Nie ustawiono punktu pakowania.",
            )
        )

    for n in nodes:
        if n.operational_type and (n.uuid not in weak or not weak[n.uuid]):
            label = n.label or (
                "Start pracy"
                if n.operational_type == OP_PICKING_START
                else "Pakowanie"
                if n.operational_type == OP_PACKING
                else "punkt specjalny"
            )
            issues.append(
                ValidationIssue(
                    code="OPERATIONAL_OFF_NETWORK",
                    severity="error",
                    message=f"Punkt specjalny „{label}” nie jest podłączony do żadnej trasy.",
                    ref_uuid=n.uuid,
                    ref_uuids=[n.uuid],
                )
            )

    if starts and packs:
        pack_ids = {p.uuid for p in packs}
        if not any(_reachable(directed, s.uuid, pack_ids) for s in starts):
            issues.append(
                ValidationIssue(
                    code="START_CANNOT_REACH_PACKING",
                    severity="error",
                    message=(
                        "Z punktu rozpoczęcia pracy nie da się dojechać do pakowania "
                        "(sprawdź kierunki odcinków)."
                    ),
                )
            )

    for ap in aps:
        if ap.node_uuid not in node_uuids:
            issues.append(
                ValidationIssue(
                    code="ACCESS_POINT_WITHOUT_NODE",
                    severity="error",
                    message="Przypisanie lokalizacji wskazuje nieistniejący punkt trasy.",
                    ref_uuid=ap.uuid,
                )
            )

    loc_ids_with_ap = {int(a.location_id) for a in aps}
    locs = (
        db.query(Location.id, Location.name)
        .filter(Location.warehouse_id == wid, Location.is_active.is_(True))
        .limit(5000)
        .all()
    )
    missing = [loc for loc in locs if int(loc.id) not in loc_ids_with_ap]
    if missing:
        issues.append(
            ValidationIssue(
                code="LOCATIONS_WITHOUT_ACCESS",
                severity="warning",
                message=(
                    f"{len(missing)} lokalizacji magazynowych nie ma przypisanego dojścia do trasy "
                    "(możesz przypisać je ręcznie przy punkcie trasy)."
                ),
            )
        )

    errors = [i for i in issues if i.severity == "error"]
    return RoutingValidationResult(ok=len(errors) == 0, issues=issues)
