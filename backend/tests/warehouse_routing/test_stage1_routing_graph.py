"""Stage 1 — Authored Warehouse Routing Graph (new SSOT)."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.location import Location
from backend.models.warehouse import Warehouse
from backend.models.warehouse_graph import WarehouseEdge, WarehouseNode, LocationNode
from backend.models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingNode,
    WarehouseRoutingGraphMeta,
)
from backend.schemas.warehouse_routing import (
    RouteComputeRequest,
    RoutingAccessPointIn,
    RoutingEdgeIn,
    RoutingGraphReplaceRequest,
    RoutingNodeIn,
)
from backend.services.warehouse_routing import (
    get_graph,
    materialize_intersections,
    replace_graph,
    route_a_to_b,
    validate_graph,
)
from backend.services.warehouse_routing.constants import (
    ERROR_NO_PATH,
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    OP_PACKING,
    OP_PICKING_START,
)


def _uid() -> str:
    return str(uuid4())


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    Warehouse.__table__.create(engine, checkfirst=True)
    Location.__table__.create(engine, checkfirst=True)
    WarehouseRoutingNode.__table__.create(engine, checkfirst=True)
    WarehouseRoutingEdge.__table__.create(engine, checkfirst=True)
    WarehouseRoutingAccessPoint.__table__.create(engine, checkfirst=True)
    WarehouseRoutingGraphMeta.__table__.create(engine, checkfirst=True)
    WarehouseNode.__table__.create(engine, checkfirst=True)
    WarehouseEdge.__table__.create(engine, checkfirst=True)
    LocationNode.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    wh = Warehouse(id=1, name="WH-R", tenant_id=1)
    session.add(wh)
    session.commit()
    yield session
    session.close()


def _simple_graph_payload(*, one_way: bool = False, enabled: bool = True, process=None, transport=None, cost_hi=1.0):
    a, b, c = _uid(), _uid(), _uid()
    # A -- B
    #  \  /
    #   C   (triangle; short path A-B vs A-C-B with cost)
    nodes = [
        RoutingNodeIn(uuid=a, x=0, y=0, node_type="operational", operational_type=OP_PICKING_START, label="Start"),
        RoutingNodeIn(uuid=b, x=1000, y=0, node_type="operational", operational_type=OP_PACKING, label="Pack"),
        RoutingNodeIn(uuid=c, x=500, y=500, node_type="junction", label="Mid"),
    ]
    e_ab = RoutingEdgeIn(
        uuid=_uid(),
        from_node_uuid=a,
        to_node_uuid=b,
        direction="FORWARD" if one_way else "BOTH",
        enabled=enabled,
        allowed_processes=process or [],
        allowed_transport_types=transport or [],
        cost_multiplier=cost_hi,
    )
    e_ac = RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=c, direction="BOTH", enabled=True)
    e_cb = RoutingEdgeIn(uuid=_uid(), from_node_uuid=c, to_node_uuid=b, direction="BOTH", enabled=True)
    return a, b, c, RoutingGraphReplaceRequest(nodes=nodes, edges=[e_ab, e_ac, e_cb])


def test_01_create_save_reload_uuid_identical(db):
    a, b, c, payload = _simple_graph_payload()
    out1 = replace_graph(db, 1, payload, materialize_crossings=False)
    uuids1 = sorted(n.uuid for n in out1.nodes)
    assert a in uuids1 and b in uuids1 and c in uuids1
    out2 = get_graph(db, 1)
    assert sorted(n.uuid for n in out2.nodes) == uuids1
    assert sorted(e.uuid for e in out2.edges) == sorted(e.uuid for e in out1.edges)


def test_02_layout_save_does_not_touch_routing_graph():
    """save_layout must not call legacy build_graph (Stage 2 removed side-effect)."""
    from pathlib import Path

    src = (Path(__file__).resolve().parents[2] / "services" / "warehouse_layout_service.py").read_text(
        encoding="utf-8"
    )
    assert "WarehouseGraphService" not in src
    assert "build_graph" not in src
    assert "assign_locations_to_graph_nodes" not in src
    # authored graph still untouched conceptually — UUID persistence covered by test_01


def test_03_a_to_b_shortest(db):
    a, b, _, payload = _simple_graph_payload(cost_hi=1.0)
    replace_graph(db, 1, payload, materialize_crossings=False)
    res = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b))
    assert res.ok
    assert res.distance_m is not None and res.distance_m > 0
    assert res.nodes[0].node_uuid == a
    assert res.nodes[-1].node_uuid == b
    # Direct AB should be preferred when cost_multiplier=1
    assert res.hop_count == 1


def test_04_one_way_respected(db):
    a, b, _, payload = _simple_graph_payload(one_way=True)
    # Remove AC/CB so only AB forward exists
    payload.edges = [e for e in payload.edges if {e.from_node_uuid, e.to_node_uuid} == {a, b}]
    replace_graph(db, 1, payload, materialize_crossings=False)
    ok_fwd = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b))
    assert ok_fwd.ok
    bad = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=b, destination_node_uuid=a))
    assert not bad.ok
    assert bad.error_code in (ERROR_NO_PATH, "DISCONNECTED_DESTINATION")


def test_05_disabled_edge_ignored(db):
    a, b, _, payload = _simple_graph_payload()
    # Disable direct AB; path via C must work
    for e in payload.edges:
        if {e.from_node_uuid, e.to_node_uuid} == {a, b}:
            e.enabled = False
    replace_graph(db, 1, payload, materialize_crossings=False)
    res = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b))
    assert res.ok
    assert res.hop_count == 2


def test_06_process_restriction(db):
    a, b, _, payload = _simple_graph_payload(process=["picking"])
    # Only AB has picking; remove other edges
    payload.edges = [e for e in payload.edges if {e.from_node_uuid, e.to_node_uuid} == {a, b}]
    replace_graph(db, 1, payload, materialize_crossings=False)
    ok = route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="picking")
    )
    assert ok.ok
    blocked = route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="putaway")
    )
    assert not blocked.ok


def test_07_transport_restriction(db):
    a, b, _, payload = _simple_graph_payload(transport=["cart"])
    payload.edges = [e for e in payload.edges if {e.from_node_uuid, e.to_node_uuid} == {a, b}]
    replace_graph(db, 1, payload, materialize_crossings=False)
    ok = route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, transport_type="cart")
    )
    assert ok.ok
    blocked = route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, transport_type="forklift")
    )
    assert not blocked.ok


def test_08_cost_multiplier_affects_choice(db):
    a, b, c, payload = _simple_graph_payload(cost_hi=50.0)
    replace_graph(db, 1, payload, materialize_crossings=False)
    res = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b))
    assert res.ok
    assert res.hop_count == 2
    assert c in {n.node_uuid for n in res.nodes}


def test_09_disconnected_clear_error(db):
    a, b = _uid(), _uid()
    payload = RoutingGraphReplaceRequest(
        nodes=[
            RoutingNodeIn(uuid=a, x=0, y=0),
            RoutingNodeIn(uuid=b, x=100, y=0),
        ],
        edges=[],
    )
    replace_graph(db, 1, payload, materialize_crossings=False)
    res = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b))
    assert not res.ok
    assert res.error_code in (ERROR_ROUTING_GRAPH_NOT_CONFIGURED, ERROR_NO_PATH, "DISCONNECTED_DESTINATION")


def test_10_intersection_creates_connectivity(db):
    # Cross: horizontal A—B and vertical C—D intersecting at center
    a, b, c, d = _uid(), _uid(), _uid(), _uid()
    nodes = [
        {"uuid": a, "x": 0, "y": 100, "node_type": "junction"},
        {"uuid": b, "x": 200, "y": 100, "node_type": "junction"},
        {"uuid": c, "x": 100, "y": 0, "node_type": "junction"},
        {"uuid": d, "x": 100, "y": 200, "node_type": "junction"},
    ]
    edges = [
        {"uuid": _uid(), "from_node_uuid": a, "to_node_uuid": b, "direction": "BOTH", "enabled": True},
        {"uuid": _uid(), "from_node_uuid": c, "to_node_uuid": d, "direction": "BOTH", "enabled": True},
    ]
    n2, e2 = materialize_intersections(nodes, edges)
    assert len(n2) == 5  # + junction
    assert len(e2) == 4  # 2 edges split into 4
    # Persist and route A→C must work via junction
    payload = RoutingGraphReplaceRequest(
        nodes=[RoutingNodeIn(**{k: v for k, v in n.items() if k in ("uuid", "x", "y", "node_type", "label")}) for n in n2],
        edges=[
            RoutingEdgeIn(
                uuid=e["uuid"],
                from_node_uuid=e["from_node_uuid"],
                to_node_uuid=e["to_node_uuid"],
                direction=e.get("direction", "BOTH"),
                enabled=True,
            )
            for e in e2
        ],
    )
    replace_graph(db, 1, payload, materialize_crossings=False)
    res = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=c))
    assert res.ok
    assert res.hop_count == 2


def test_11_access_point_persists(db):
    loc = Location(id=10, warehouse_id=1, name="A-01", is_active=True)
    db.add(loc)
    db.commit()
    a, b, _, payload = _simple_graph_payload()
    payload.access_points = [
        RoutingAccessPointIn(uuid=_uid(), location_id=10, node_uuid=a, label="AP A-01")
    ]
    out = replace_graph(db, 1, payload, materialize_crossings=False)
    assert len(out.access_points) == 1
    assert out.access_points[0].location_id == 10
    assert out.access_points[0].node_uuid == a
    again = get_graph(db, 1)
    assert again.access_points[0].uuid == out.access_points[0].uuid


def test_12_operational_points_persist(db):
    a, b, _, payload = _simple_graph_payload()
    out = replace_graph(db, 1, payload, materialize_crossings=False)
    ops = {n.operational_type for n in out.nodes if n.operational_type}
    assert OP_PICKING_START in ops
    assert OP_PACKING in ops


def test_13_validation_detects_issues(db):
    a, b = _uid(), _uid()
    # Two disconnected nodes, no ops, no access
    loc = Location(id=11, warehouse_id=1, name="B-01", is_active=True)
    db.add(loc)
    db.commit()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            nodes=[RoutingNodeIn(uuid=a, x=0, y=0), RoutingNodeIn(uuid=b, x=50, y=0)],
            edges=[],
        ),
        materialize_crossings=False,
    )
    res = validate_graph(db, 1)
    codes = {i.code for i in res.issues}
    assert "MISSING_PICKING_START" in codes
    assert "MISSING_PACKING" in codes
    assert "NO_EDGES" in codes or "ORPHAN_NODES" in codes
    assert "LOCATIONS_WITHOUT_ACCESS" in codes
    # Human UX: no UUID spam in messages
    for issue in res.issues:
        assert a not in issue.message
        assert b not in issue.message
        assert "edge" not in issue.message.lower()
        assert "węzeł" not in issue.message.lower()
    no_edges = next(i for i in res.issues if i.code == "NO_EDGES")
    assert "trasy" in no_edges.message.lower() or "punkt" in no_edges.message.lower()
    assert len(no_edges.ref_uuids) == 2
    # Structural broken → ok False; ops issues are info and do not alone define ok
    assert res.ok is False
    assert res.operational_ready is False
    assert all(
        i.severity == "info"
        for i in res.issues
        if i.code in {"MISSING_PICKING_START", "MISSING_PACKING", "LOCATIONS_WITHOUT_ACCESS"}
    )


def test_13d_structural_ok_but_not_operational_ready(db):
    """Connected graph with start+pack can be ok=True while locations still pending."""
    loc = Location(id=12, warehouse_id=1, name="C-01", is_active=True)
    db.add(loc)
    db.commit()
    _, _, _, payload = _simple_graph_payload()
    replace_graph(db, 1, payload, materialize_crossings=False)
    res = validate_graph(db, 1)
    assert res.ok is True
    assert res.operational_ready is False
    loc_issue = next(i for i in res.issues if i.code == "LOCATIONS_WITHOUT_ACCESS")
    assert loc_issue.severity == "info"
    assert "MISSING_PICKING_START" not in {i.code for i in res.issues}
    assert "MISSING_PACKING" not in {i.code for i in res.issues}


def test_13b_delete_node_persists_after_save_reload(db):
    """create → save → delete → save → reload → node gone (and its edges)."""
    a, b, c, payload = _simple_graph_payload()
    out1 = replace_graph(db, 1, payload, materialize_crossings=False)
    assert {n.uuid for n in out1.nodes} == {a, b, c}
    keep_nodes = [n for n in out1.nodes if n.uuid != c]
    keep_edges = [
        e
        for e in out1.edges
        if e.from_node_uuid != c and e.to_node_uuid != c
    ]
    payload2 = RoutingGraphReplaceRequest(
        expected_revision=out1.revision,
        nodes=[
            RoutingNodeIn(
                uuid=n.uuid,
                x=n.x,
                y=n.y,
                node_type=n.node_type,
                operational_type=n.operational_type,
                label=n.label,
            )
            for n in keep_nodes
        ],
        edges=[
            RoutingEdgeIn(
                uuid=e.uuid,
                from_node_uuid=e.from_node_uuid,
                to_node_uuid=e.to_node_uuid,
                direction=e.direction,
                enabled=e.enabled,
                distance_m=e.distance_m,
                allowed_processes=list(e.allowed_processes or []),
                allowed_transport_types=list(e.allowed_transport_types or []),
                cost_multiplier=e.cost_multiplier,
            )
            for e in keep_edges
        ],
        access_points=[],
    )
    out2 = replace_graph(db, 1, payload2, materialize_crossings=False)
    reloaded = get_graph(db, 1)
    uuids = {n.uuid for n in reloaded.nodes}
    assert c not in uuids
    assert a in uuids and b in uuids
    assert all(e.from_node_uuid != c and e.to_node_uuid != c for e in reloaded.edges)
    assert out2.revision == reloaded.revision


def test_13c_validation_aggregates_orphans_when_edges_exist(db):
    a, b, orphan = _uid(), _uid(), _uid()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            nodes=[
                RoutingNodeIn(
                    uuid=a, x=0, y=0, node_type="operational", operational_type=OP_PICKING_START
                ),
                RoutingNodeIn(
                    uuid=b, x=100, y=0, node_type="operational", operational_type=OP_PACKING
                ),
                RoutingNodeIn(uuid=orphan, x=500, y=500),
            ],
            edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b)],
        ),
        materialize_crossings=False,
    )
    res = validate_graph(db, 1)
    orphan_issue = next(i for i in res.issues if i.code == "ORPHAN_NODES")
    assert orphan_issue.message == "1 punkt nie jest połączony z żadną trasą."
    assert orphan_issue.ref_uuids == [orphan]
    assert orphan not in orphan_issue.message


def test_14_route_uses_only_new_graph_not_legacy(db):
    """Engine must fail when only legacy nodes exist; succeed only on authored graph."""
    # Legacy nodes only
    db.add(WarehouseNode(warehouse_id=1, x=0, y=0, type="packing"))
    db.add(WarehouseNode(warehouse_id=1, x=100, y=0, type="intersection"))
    db.commit()
    res = route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=_uid(), destination_node_uuid=_uid())
    )
    assert not res.ok
    assert res.error_code == ERROR_ROUTING_GRAPH_NOT_CONFIGURED

    a, b, _, payload = _simple_graph_payload()
    replace_graph(db, 1, payload, materialize_crossings=False)
    ok = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b))
    assert ok.ok


def test_15_legacy_warehouse_node_still_queryable(db):
    """Migration coexistence: legacy tables still work independently."""
    n = WarehouseNode(warehouse_id=1, x=10, y=20, type="intersection")
    db.add(n)
    db.commit()
    rows = db.query(WarehouseNode).filter(WarehouseNode.warehouse_id == 1).all()
    assert len(rows) >= 1
    # Authored empty
    g = get_graph(db, 1)
    assert g.configured is False
