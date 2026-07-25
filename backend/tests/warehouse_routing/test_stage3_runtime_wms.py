"""Etap 3 — Runtime WMS uses Authored Routing Graph Reader only."""

from __future__ import annotations

import ast
from pathlib import Path
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
    WarehouseRoutingLocationAccess,
    WarehouseRoutingNode,
)
from backend.schemas.warehouse_routing import (
    RoutingAccessPointIn,
    RoutingEdgeIn,
    RoutingGraphReplaceRequest,
    RoutingNodeIn,
)
from backend.services.warehouse_routing import replace_graph
from backend.services.warehouse_routing.constants import (
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    OP_PACKING,
    OP_PICKING_START,
)
from backend.services.warehouse_routing.runtime_graph_reader import (
    chain_distance_m,
    graph_ready,
    hop_cost_m,
    order_location_ids_by_graph,
    visit_index_map,
)


ROOT = Path(__file__).resolve().parents[2]


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
        WarehouseRoutingLocationAccess,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    s = Session()
    s.add(Warehouse(id=1, name="WH1", tenant_id=1))
    s.add(Location(id=10, warehouse_id=1, name="NEAR-LOC", is_active=True, x=100, y=0))
    s.add(Location(id=20, warehouse_id=1, name="FAR-LOC", is_active=True, x=100, y=200))
    s.add(Location(id=30, warehouse_id=1, name="PACK-LOC", is_active=True, x=200, y=0))
    s.commit()
    yield s
    s.close()


def _seed(db, *, disable_near_pack: bool = False, far_cost: float = 1.0):
    start, near, far, pack = _uid(), _uid(), _uid(), _uid()
    e_sn, e_sf, e_np, e_fp = _uid(), _uid(), _uid(), _uid()
    payload = RoutingGraphReplaceRequest(
        expected_revision=1,
        nodes=[
            RoutingNodeIn(
                uuid=start, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational", label="S"
            ),
            RoutingNodeIn(uuid=near, x=100, y=0, label="NEAR"),
            RoutingNodeIn(uuid=far, x=100, y=200, label="FAR"),
            RoutingNodeIn(
                uuid=pack, x=200, y=0, operational_type=OP_PACKING, node_type="operational", label="P"
            ),
        ],
        edges=[
            RoutingEdgeIn(uuid=e_sn, from_node_uuid=start, to_node_uuid=near, direction="BOTH"),
            RoutingEdgeIn(
                uuid=e_sf,
                from_node_uuid=start,
                to_node_uuid=far,
                direction="BOTH",
                cost_multiplier=far_cost,
            ),
            RoutingEdgeIn(
                uuid=e_np,
                from_node_uuid=near,
                to_node_uuid=pack,
                direction="BOTH",
                enabled=not disable_near_pack,
            ),
            RoutingEdgeIn(
                uuid=e_fp,
                from_node_uuid=far,
                to_node_uuid=pack,
                direction="BOTH",
                cost_multiplier=far_cost,
            ),
        ],
        access_points=[
            RoutingAccessPointIn(uuid=_uid(), location_id=10, node_uuid=near, label="near"),
            RoutingAccessPointIn(uuid=_uid(), location_id=20, node_uuid=far, label="far"),
            RoutingAccessPointIn(uuid=_uid(), location_id=30, node_uuid=pack, label="pack"),
        ],
    )
    g = replace_graph(db, 1, payload, materialize_crossings=False)
    return {
        "start": start,
        "near": near,
        "far": far,
        "pack": pack,
        "revision": g.revision,
        "e_np": e_np,
    }


def test_graph_ready_false_without_edges(db):
    assert graph_ready(db, 1) is False


def test_order_location_ids_uses_graph_nn(db):
    _seed(db, far_cost=8.0)
    ordered, err = order_location_ids_by_graph(db, 1, [20, 10, 30])
    assert err is None
    # From START, NEAR (10) is cheaper than FAR (20)
    assert ordered[0] == 10
    assert set(ordered) == {10, 20, 30}


def test_order_deterministic(db):
    _seed(db)
    a, _ = order_location_ids_by_graph(db, 1, [30, 20, 10])
    b, _ = order_location_ids_by_graph(db, 1, [10, 30, 20])
    assert a == b


def test_disabled_aisle_changes_route_cost(db):
    """Zamknięty odcinek near→pack: hop 10→30 jest droższy / niedostępny względem 20→30."""
    ids = _seed(db, disable_near_pack=False, far_cost=1.0)
    d_open, e_open = hop_cost_m(db, 1, 10, 30)
    assert e_open is None and d_open is not None

    # Disable near→pack on same session via replace with revision+1
    start, near, far, pack = ids["start"], ids["near"], ids["far"], ids["pack"]
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=ids["revision"],
            nodes=[
                RoutingNodeIn(
                    uuid=start, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"
                ),
                RoutingNodeIn(uuid=near, x=100, y=0),
                RoutingNodeIn(uuid=far, x=100, y=200),
                RoutingNodeIn(uuid=pack, x=200, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=start, to_node_uuid=near),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=start, to_node_uuid=far),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=near, to_node_uuid=pack, enabled=False),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=far, to_node_uuid=pack),
            ],
            access_points=[
                RoutingAccessPointIn(uuid=_uid(), location_id=10, node_uuid=near),
                RoutingAccessPointIn(uuid=_uid(), location_id=20, node_uuid=far),
                RoutingAccessPointIn(uuid=_uid(), location_id=30, node_uuid=pack),
            ],
        ),
        materialize_crossings=False,
    )
    d_closed, e_closed = hop_cost_m(db, 1, 10, 30)
    d_far, e_far = hop_cost_m(db, 1, 20, 30)
    assert e_far is None and d_far is not None
    # Closed aisle: near→pack fails or becomes strictly longer than far→pack
    assert e_closed is not None or (d_closed is not None and d_closed > d_far + 1e-6)
    assert d_open is not None
    if d_closed is not None:
        assert d_closed >= d_open - 1e-6


def test_chain_distance_uses_graph(db):
    _seed(db, far_cost=5.0)
    ordered, _ = order_location_ids_by_graph(db, 1, [10, 30])
    dist, err, path = chain_distance_m(db, 1, ordered)
    assert err is None
    assert dist is not None and dist > 0
    assert path


def test_visit_index_map(db):
    _seed(db)
    m = visit_index_map(db, 1, [30, 10, 20])
    assert set(m.keys()) == {10, 20, 30}
    assert m[10] < m[20] or m[10] < m[30]


def test_no_graph_returns_error_code(db):
    ordered, err = order_location_ids_by_graph(db, 1, [10, 20])
    assert err == ERROR_ROUTING_GRAPH_NOT_CONFIGURED
    assert ordered == [10, 20]  # stable id sort, not geometry


def test_picking_service_imports_runtime_reader():
    src = (ROOT / "services" / "picking_routing_service.py").read_text(encoding="utf-8")
    assert "runtime_graph_reader" in src
    assert "visit_index_map" in src
    assert "distance_between" not in src
    assert "_location_label_to_coords" not in src


def test_wave_service_no_label_heuristic():
    src = (ROOT / "services" / "wave_service.py").read_text(encoding="utf-8")
    assert "runtime_graph_reader" in src
    assert "_distance_between" not in src
    assert "_location_label_to_coords" not in src


def test_pick_helpers_no_euclidean_visit_order():
    src = (ROOT / "domain" / "picking_simulation" / "_pick_helpers.py").read_text(encoding="utf-8")
    assert "runtime_graph_reader" in src
    assert "compute_visit_order_euclidean" not in src


def test_wms_modules_share_one_reader_ssot():
    """Static: runtime consumers import runtime_graph_reader or access_resolution/engine — not legacy."""
    files = [
        ROOT / "services" / "picking_routing_service.py",
        ROOT / "services" / "wave_service.py",
        ROOT / "domain" / "picking_simulation" / "_pick_helpers.py",
        ROOT / "services" / "analytics_service.py",
        ROOT / "api" / "route.py",
    ]
    banned = ("WarehouseGraphService", "from ..models.warehouse_graph", "_distance_between")
    for path in files:
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        for b in banned:
            assert b not in text, f"{path.name} still references {b}"


def test_runtime_reader_ast_no_manhattan():
    path = ROOT / "services" / "warehouse_routing" / "runtime_graph_reader.py"
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names = {n.id for n in ast.walk(tree) if isinstance(n, ast.Name)}
    assert "manhattan" not in {x.lower() for x in names}
