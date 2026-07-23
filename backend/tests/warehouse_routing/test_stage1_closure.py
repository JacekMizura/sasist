"""Stage-1 closure: diamond route scenario, drag persistence, AP 1..N, intersection route."""

from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.location import Location
from backend.models.warehouse import Warehouse
from backend.models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingNode,
)
from backend.schemas.warehouse_routing import (
    RouteComputeRequest,
    RoutingAccessPointIn,
    RoutingEdgeIn,
    RoutingGraphReplaceRequest,
    RoutingNodeIn,
)
from backend.services.warehouse_routing import get_graph, replace_graph, route_a_to_b
from backend.services.warehouse_routing.constants import OP_PACKING, OP_PICKING_START


def _uid() -> str:
    return str(uuid4())


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    for model in (
        Warehouse,
        Location,
        WarehouseRoutingNode,
        WarehouseRoutingEdge,
        WarehouseRoutingAccessPoint,
        WarehouseRoutingGraphMeta,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    s = Session()
    s.add(Warehouse(id=1, name="WH1", tenant_id=1))
    s.commit()
    yield s
    s.close()


def _diamond_payload():
    """
    START
       |
       A
      / \\
     B   C
      \\ /
    PACKING
    """
    start, a, b, c, pack = _uid(), _uid(), _uid(), _uid(), _uid()
    e_sa, e_ab, e_ac, e_bp, e_cp = _uid(), _uid(), _uid(), _uid(), _uid()
    nodes = [
        RoutingNodeIn(uuid=start, x=100, y=0, node_type="operational", operational_type=OP_PICKING_START, label="START"),
        RoutingNodeIn(uuid=a, x=100, y=100, label="A"),
        RoutingNodeIn(uuid=b, x=0, y=200, label="B"),
        RoutingNodeIn(uuid=c, x=200, y=200, label="C"),
        RoutingNodeIn(uuid=pack, x=100, y=300, node_type="operational", operational_type=OP_PACKING, label="PAKOWANIE"),
    ]
    edges = [
        RoutingEdgeIn(uuid=e_sa, from_node_uuid=start, to_node_uuid=a, direction="BOTH"),
        RoutingEdgeIn(uuid=e_ab, from_node_uuid=a, to_node_uuid=b, direction="BOTH"),
        RoutingEdgeIn(uuid=e_ac, from_node_uuid=a, to_node_uuid=c, direction="BOTH"),
        RoutingEdgeIn(uuid=e_bp, from_node_uuid=b, to_node_uuid=pack, direction="BOTH"),
        RoutingEdgeIn(uuid=e_cp, from_node_uuid=c, to_node_uuid=pack, direction="BOTH"),
    ]
    return {
        "ids": {"start": start, "a": a, "b": b, "c": c, "pack": pack},
        "edge_ids": {"sa": e_sa, "ab": e_ab, "ac": e_ac, "bp": e_bp, "cp": e_cp},
        "payload": RoutingGraphReplaceRequest(expected_revision=1, nodes=nodes, edges=edges),
    }


def test_diamond_shortest_uses_either_equal_branch(db):
    d = _diamond_payload()
    replace_graph(db, 1, d["payload"], materialize_crossings=False)
    res = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=d["ids"]["start"], destination_node_uuid=d["ids"]["pack"]),
    )
    assert res.ok
    assert res.hop_count == 3
    path_nodes = [n.node_uuid for n in res.nodes]
    assert path_nodes[0] == d["ids"]["start"]
    assert path_nodes[1] == d["ids"]["a"]
    assert path_nodes[-1] == d["ids"]["pack"]
    assert path_nodes[2] in (d["ids"]["b"], d["ids"]["c"])
    edge_uuids = {s.edge_uuid for s in res.path_segments}
    assert d["edge_ids"]["sa"] in edge_uuids


def test_diamond_cost_multiplier_switches_branch(db):
    d = _diamond_payload()
    for e in d["payload"].edges:
        if e.uuid == d["edge_ids"]["ab"]:
            e.cost_multiplier = 5.0
    replace_graph(db, 1, d["payload"], materialize_crossings=False)
    res = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=d["ids"]["start"], destination_node_uuid=d["ids"]["pack"]),
    )
    assert res.ok
    assert d["ids"]["c"] in [n.node_uuid for n in res.nodes]
    assert d["ids"]["b"] not in [n.node_uuid for n in res.nodes]
    assert d["edge_ids"]["ac"] in {s.edge_uuid for s in res.path_segments}
    assert d["edge_ids"]["ab"] not in {s.edge_uuid for s in res.path_segments}


def test_diamond_disable_edge_switches_branch(db):
    d = _diamond_payload()
    for e in d["payload"].edges:
        if e.uuid == d["edge_ids"]["cp"]:
            e.enabled = False
    replace_graph(db, 1, d["payload"], materialize_crossings=False)
    res = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=d["ids"]["start"], destination_node_uuid=d["ids"]["pack"]),
    )
    assert res.ok
    assert d["ids"]["b"] in [n.node_uuid for n in res.nodes]
    assert d["edge_ids"]["bp"] in {s.edge_uuid for s in res.path_segments}


def test_diamond_one_way_blocks_wrong_direction(db):
    d = _diamond_payload()
    for e in d["payload"].edges:
        if e.uuid == d["edge_ids"]["sa"]:
            e.direction = "FORWARD"  # start → A only
        if e.uuid in (d["edge_ids"]["ab"], d["edge_ids"]["ac"], d["edge_ids"]["bp"], d["edge_ids"]["cp"]):
            e.direction = "FORWARD"
    replace_graph(db, 1, d["payload"], materialize_crossings=False)
    ok = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=d["ids"]["start"], destination_node_uuid=d["ids"]["pack"]),
    )
    assert ok.ok
    bad = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=d["ids"]["pack"], destination_node_uuid=d["ids"]["start"]),
    )
    assert not bad.ok


def test_diamond_process_and_transport_restrictions(db):
    d = _diamond_payload()
    for e in d["payload"].edges:
        if e.uuid == d["edge_ids"]["ab"]:
            e.allowed_processes = ["picking"]
            e.allowed_transport_types = ["foot"]
        if e.uuid == d["edge_ids"]["ac"]:
            e.allowed_processes = ["putaway"]
            e.allowed_transport_types = ["forklift"]
        if e.uuid == d["edge_ids"]["bp"]:
            e.allowed_processes = ["picking"]
            e.allowed_transport_types = ["foot"]
        if e.uuid == d["edge_ids"]["cp"]:
            e.allowed_processes = ["putaway"]
            e.allowed_transport_types = ["forklift"]
        if e.uuid == d["edge_ids"]["sa"]:
            e.allowed_processes = []
            e.allowed_transport_types = []
    replace_graph(db, 1, d["payload"], materialize_crossings=False)

    pick_foot = route_a_to_b(
        db,
        1,
        RouteComputeRequest(
            start_node_uuid=d["ids"]["start"],
            destination_node_uuid=d["ids"]["pack"],
            process_type="picking",
            transport_type="foot",
        ),
    )
    assert pick_foot.ok
    assert d["ids"]["b"] in [n.node_uuid for n in pick_foot.nodes]

    put_fork = route_a_to_b(
        db,
        1,
        RouteComputeRequest(
            start_node_uuid=d["ids"]["start"],
            destination_node_uuid=d["ids"]["pack"],
            process_type="putaway",
            transport_type="forklift",
        ),
    )
    assert put_fork.ok
    assert d["ids"]["c"] in [n.node_uuid for n in put_fork.nodes]

    blocked = route_a_to_b(
        db,
        1,
        RouteComputeRequest(
            start_node_uuid=d["ids"]["start"],
            destination_node_uuid=d["ids"]["pack"],
            process_type="picking",
            transport_type="forklift",
        ),
    )
    assert not blocked.ok


def test_node_drag_position_persists_after_save_reload(db):
    a, b = _uid(), _uid()
    e = _uid()
    g1 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=a, x=50, y=50, operational_type=OP_PICKING_START, node_type="operational", label="S"),
                RoutingNodeIn(uuid=b, x=150, y=50, operational_type=OP_PACKING, node_type="operational", label="P"),
            ],
            edges=[RoutingEdgeIn(uuid=e, from_node_uuid=a, to_node_uuid=b)],
        ),
        materialize_crossings=False,
    )
    # Simulate drag of B to new snapped grid position
    g2 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=g1.revision,
            nodes=[
                RoutingNodeIn(uuid=a, x=50, y=50, operational_type=OP_PICKING_START, node_type="operational", label="S"),
                RoutingNodeIn(uuid=b, x=250, y=120, operational_type=OP_PACKING, node_type="operational", label="P"),
            ],
            edges=[RoutingEdgeIn(uuid=e, from_node_uuid=a, to_node_uuid=b, distance_m=0.0)],
        ),
        materialize_crossings=False,
    )
    reloaded = get_graph(db, 1)
    nb = next(n for n in reloaded.nodes if n.uuid == b)
    assert nb.x == 250
    assert nb.y == 120
    assert abs(reloaded.edges[0].distance_m - ((200**2 + 70**2) ** 0.5) / 100) < 1e-6
    # operational types preserved
    assert nb.operational_type == OP_PACKING


def test_access_points_preserved_after_node_move(db):
    loc = Location(id=1, warehouse_id=1, name="R-01-A", is_active=True)
    db.add(loc)
    db.commit()
    a, b = _uid(), _uid()
    ap = _uid()
    g1 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=a, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=b, x=100, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b)],
            access_points=[RoutingAccessPointIn(uuid=ap, location_id=1, node_uuid=a, label="Dostęp: R-01-A")],
        ),
        materialize_crossings=False,
    )
    g2 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=g1.revision,
            nodes=[
                RoutingNodeIn(uuid=a, x=40, y=80, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=b, x=100, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b)],
            access_points=[RoutingAccessPointIn(uuid=ap, location_id=1, node_uuid=a, label="Dostęp: R-01-A")],
        ),
        materialize_crossings=False,
    )
    assert len(g2.access_points) == 1
    assert g2.access_points[0].uuid == ap
    assert g2.access_points[0].node_uuid == a
    assert g2.access_points[0].location_id == 1


def test_crossing_materialized_enables_route(db):
    """New route crossing existing segment → junction after save → path through junction."""
    a, b, c, d = _uid(), _uid(), _uid(), _uid()
    e1, e2 = _uid(), _uid()
    g = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=a, x=0, y=100, operational_type=OP_PICKING_START, node_type="operational", label="S"),
                RoutingNodeIn(uuid=b, x=200, y=100, operational_type=OP_PACKING, node_type="operational", label="P"),
                RoutingNodeIn(uuid=c, x=100, y=0, label="N"),
                RoutingNodeIn(uuid=d, x=100, y=200, label="S2"),
            ],
            edges=[
                RoutingEdgeIn(uuid=e1, from_node_uuid=a, to_node_uuid=b, direction="BOTH"),
                RoutingEdgeIn(uuid=e2, from_node_uuid=c, to_node_uuid=d, direction="BOTH"),
            ],
        ),
        materialize_crossings=True,
    )
    assert len(g.nodes) >= 5  # + junction
    assert len(g.edges) >= 4
    res = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=d))
    assert res.ok
    assert res.hop_count >= 2


def test_schema_has_no_legacy_1to1_ap_unique():
    """ORM model must use 1..N unique (wh+loc+node), not location-only unique."""
    names = {c.name for c in WarehouseRoutingAccessPoint.__table__.constraints if getattr(c, "name", None)}
    assert "uq_warehouse_routing_access_points_wh_loc_node" in names
    assert "uq_warehouse_routing_access_points_wh_loc" not in names
    from backend.db import warehouse_routing_schema as sch

    assert not hasattr(sch, "_drop_legacy_ap_unique")
    assert sch.WAREHOUSE_ROUTING_SCHEMA_VERSION.endswith("routing.3")
