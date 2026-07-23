"""Final Stage-1 audit fixes: concurrency, isolation, idempotent intersections, distance SSOT."""

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
from backend.services.warehouse_routing import get_graph, materialize_intersections, replace_graph, route_a_to_b, validate_graph
from backend.services.warehouse_routing.constants import (
    ERROR_FOREIGN_LOCATION,
    ERROR_OVERLAPPING_EDGES,
    ERROR_VERSION_CONFLICT,
    OP_PACKING,
    OP_PICKING_START,
    RoutingGraphValidationError,
    RoutingGraphVersionConflict,
)
from backend.services.warehouse_routing.geometry import segments_overlap_collinear


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
    s.add(Warehouse(id=2, name="WH2", tenant_id=1))
    s.commit()
    yield s
    s.close()


def test_intersection_idempotent_save_reload_save(db):
    a, b, c, d = _uid(), _uid(), _uid(), _uid()
    e1, e2 = _uid(), _uid()
    payload = RoutingGraphReplaceRequest(
        expected_revision=1,
        nodes=[
            RoutingNodeIn(uuid=a, x=0, y=100, operational_type=OP_PICKING_START, node_type="operational", label="S"),
            RoutingNodeIn(uuid=b, x=200, y=100, operational_type=OP_PACKING, node_type="operational", label="P"),
            RoutingNodeIn(uuid=c, x=100, y=0),
            RoutingNodeIn(uuid=d, x=100, y=200),
        ],
        edges=[
            RoutingEdgeIn(uuid=e1, from_node_uuid=a, to_node_uuid=b, direction="BOTH"),
            RoutingEdgeIn(uuid=e2, from_node_uuid=c, to_node_uuid=d, direction="BOTH"),
        ],
    )
    g1 = replace_graph(db, 1, payload, materialize_crossings=True)
    assert len(g1.nodes) == 5
    assert len(g1.edges) == 4
    n_uuids = sorted(n.uuid for n in g1.nodes)
    e_uuids = sorted(e.uuid for e in g1.edges)
    rev = g1.revision

    # reload → save unchanged
    g_reload = get_graph(db, 1)
    payload2 = RoutingGraphReplaceRequest(
        expected_revision=g_reload.revision,
        nodes=[
            RoutingNodeIn(
                uuid=n.uuid,
                x=n.x,
                y=n.y,
                node_type=n.node_type,
                operational_type=n.operational_type,
                label=n.label,
                meta=n.meta,
            )
            for n in g_reload.nodes
        ],
        edges=[
            RoutingEdgeIn(
                uuid=e.uuid,
                from_node_uuid=e.from_node_uuid,
                to_node_uuid=e.to_node_uuid,
                direction=e.direction,
                enabled=e.enabled,
                allowed_processes=e.allowed_processes,
                allowed_transport_types=e.allowed_transport_types,
                cost_multiplier=e.cost_multiplier,
                label=e.label,
            )
            for e in g_reload.edges
        ],
    )
    g2 = replace_graph(db, 1, payload2, materialize_crossings=True)
    assert len(g2.nodes) == 5
    assert len(g2.edges) == 4
    assert sorted(n.uuid for n in g2.nodes) == n_uuids
    assert sorted(e.uuid for e in g2.edges) == e_uuids
    assert g2.revision == rev + 1

    # third save
    g3 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=g2.revision,
            nodes=payload2.nodes,
            edges=payload2.edges,
        ),
        materialize_crossings=True,
    )
    assert len(g3.nodes) == 5
    assert sorted(n.uuid for n in g3.nodes) == n_uuids


def test_shared_endpoint_does_not_create_extra_junction():
    a, b, c = _uid(), _uid(), _uid()
    nodes = [
        {"uuid": a, "x": 0, "y": 0, "node_type": "junction"},
        {"uuid": b, "x": 100, "y": 0, "node_type": "junction"},
        {"uuid": c, "x": 100, "y": 100, "node_type": "junction"},
    ]
    edges = [
        {"uuid": _uid(), "from_node_uuid": a, "to_node_uuid": b, "direction": "BOTH", "enabled": True},
        {"uuid": _uid(), "from_node_uuid": b, "to_node_uuid": c, "direction": "BOTH", "enabled": True},
    ]
    n2, e2 = materialize_intersections(nodes, edges)
    assert len(n2) == 3
    assert len(e2) == 2


def test_overlapping_edges_rejected(db):
    a, b, c = _uid(), _uid(), _uid()
    payload = RoutingGraphReplaceRequest(
        expected_revision=1,
        nodes=[
            RoutingNodeIn(uuid=a, x=0, y=0),
            RoutingNodeIn(uuid=b, x=100, y=0),
            RoutingNodeIn(uuid=c, x=50, y=0),
        ],
        edges=[
            RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b),
            RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=c),  # collinear overlap on AB
        ],
    )
    with pytest.raises(RoutingGraphValidationError) as ei:
        replace_graph(db, 1, payload, materialize_crossings=False)
    assert ei.value.code == ERROR_OVERLAPPING_EDGES


def test_distance_recomputed_after_node_move(db):
    a, b = _uid(), _uid()
    e = _uid()
    g1 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=a, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=b, x=100, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[RoutingEdgeIn(uuid=e, from_node_uuid=a, to_node_uuid=b, distance_m=999.0)],
        ),
        materialize_crossings=False,
    )
    assert abs(g1.edges[0].distance_m - 1.0) < 1e-6  # 100 cm = 1 m
    g2 = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=g1.revision,
            nodes=[
                RoutingNodeIn(uuid=a, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=b, x=200, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[RoutingEdgeIn(uuid=e, from_node_uuid=a, to_node_uuid=b, distance_m=0.01)],
        ),
        materialize_crossings=False,
    )
    assert abs(g2.edges[0].distance_m - 2.0) < 1e-6


def test_version_conflict(db):
    a, b = _uid(), _uid()
    payload = RoutingGraphReplaceRequest(
        expected_revision=1,
        nodes=[
            RoutingNodeIn(uuid=a, x=0, y=0),
            RoutingNodeIn(uuid=b, x=10, y=0),
        ],
        edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b)],
    )
    g1 = replace_graph(db, 1, payload, materialize_crossings=False)
    # stale revision
    with pytest.raises(RoutingGraphVersionConflict) as ei:
        replace_graph(
            db,
            1,
            RoutingGraphReplaceRequest(
                expected_revision=g1.revision - 1,
                nodes=payload.nodes,
                edges=payload.edges,
            ),
            materialize_crossings=False,
        )
    assert ERROR_VERSION_CONFLICT in str(ei.value)


def test_cross_warehouse_location_rejected(db):
    loc_other = Location(id=99, warehouse_id=2, name="OTHER", is_active=True)
    db.add(loc_other)
    db.commit()
    a = _uid()
    with pytest.raises(RoutingGraphValidationError) as ei:
        replace_graph(
            db,
            1,
            RoutingGraphReplaceRequest(
                expected_revision=1,
                nodes=[RoutingNodeIn(uuid=a, x=0, y=0)],
                edges=[],
                access_points=[RoutingAccessPointIn(uuid=_uid(), location_id=99, node_uuid=a)],
            ),
            materialize_crossings=False,
        )
    assert ei.value.code == ERROR_FOREIGN_LOCATION


def test_multiple_access_points_same_location(db):
    loc = Location(id=5, warehouse_id=1, name="A-01", is_active=True)
    db.add(loc)
    db.commit()
    n1, n2 = _uid(), _uid()
    g = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=n1, x=0, y=0, node_type="access"),
                RoutingNodeIn(uuid=n2, x=10, y=0, node_type="access"),
            ],
            edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=n1, to_node_uuid=n2)],
            access_points=[
                RoutingAccessPointIn(uuid=_uid(), location_id=5, node_uuid=n1, label="side A"),
                RoutingAccessPointIn(uuid=_uid(), location_id=5, node_uuid=n2, label="side B"),
            ],
        ),
        materialize_crossings=False,
    )
    assert len(g.access_points) == 2


def test_one_way_chain(db):
    a, b, c = _uid(), _uid(), _uid()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=a, x=0, y=0),
                RoutingNodeIn(uuid=b, x=100, y=0),
                RoutingNodeIn(uuid=c, x=200, y=0),
            ],
            edges=[
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b, direction="FORWARD"),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=b, to_node_uuid=c, direction="FORWARD"),
            ],
        ),
        materialize_crossings=False,
    )
    ok = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=c))
    assert ok.ok and ok.hop_count == 2
    bad = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=c, destination_node_uuid=a))
    assert not bad.ok


def test_validation_start_cannot_reach_packing_one_way(db):
    s, p = _uid(), _uid()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=s, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=p, x=100, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            # only packing → start (wrong way for picking flow)
            edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=p, to_node_uuid=s, direction="FORWARD")],
        ),
        materialize_crossings=False,
    )
    res = validate_graph(db, 1)
    codes = {i.code for i in res.issues}
    assert "START_CANNOT_REACH_PACKING" in codes


def test_multiple_packing_allowed(db):
    s, p1, p2 = _uid(), _uid(), _uid()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=s, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=p1, x=100, y=0, operational_type=OP_PACKING, node_type="operational"),
                RoutingNodeIn(uuid=p2, x=0, y=100, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=s, to_node_uuid=p1),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=s, to_node_uuid=p2),
            ],
        ),
        materialize_crossings=False,
    )
    res = validate_graph(db, 1)
    assert "MISSING_PACKING" not in {i.code for i in res.issues}


def test_empty_process_means_all(db):
    a, b = _uid(), _uid()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[RoutingNodeIn(uuid=a, x=0, y=0), RoutingNodeIn(uuid=b, x=50, y=0)],
            edges=[RoutingEdgeIn(uuid=_uid(), from_node_uuid=a, to_node_uuid=b, allowed_processes=[])],
        ),
        materialize_crossings=False,
    )
    ok = route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="picking")
    )
    assert ok.ok


def test_legacy_isolation_imports():
    import backend.services.warehouse_routing.engine as eng
    import backend.services.warehouse_routing.graph_service as gs
    import inspect

    src = inspect.getsource(eng) + inspect.getsource(gs)
    assert "WarehouseNode" not in src or "legacy WarehouseNode" in src
    assert "from ...models.warehouse_graph" not in inspect.getsource(eng)
    assert "from ...models.warehouse_graph" not in inspect.getsource(gs)
    assert "warehouse_graph_service" not in inspect.getsource(eng)
