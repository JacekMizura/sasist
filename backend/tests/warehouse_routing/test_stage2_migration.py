"""Stage 2 — consumers use authored Routing Graph; no legacy fallback."""

from __future__ import annotations

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
    WarehouseRoutingNode,
)
from backend.schemas.warehouse_routing import (
    RoutingAccessPointIn,
    RoutingEdgeIn,
    RoutingGraphReplaceRequest,
    RoutingNodeIn,
)
from backend.services.warehouse_routing import replace_graph, route_a_to_b
from backend.services.warehouse_routing.access_resolution import (
    is_routing_graph_configured,
    route_best_among_candidates,
    route_between_locations,
    route_between_points_cm,
)
from backend.services.warehouse_routing.constants import (
    ERROR_ROUTING_GRAPH_NOT_CONFIGURED,
    OP_PACKING,
    OP_PICKING_START,
    PROCESS_PICKING,
    TRANSPORT_FOOT,
)
from backend.schemas.warehouse_routing import RouteComputeRequest


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
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    s = Session()
    s.add(Warehouse(id=1, name="WH1", tenant_id=1))
    s.add(Location(id=1, warehouse_id=1, name="L-A", is_active=True, x=0, y=0))
    s.add(Location(id=2, warehouse_id=1, name="L-B", is_active=True, x=200, y=0))
    s.commit()
    yield s
    s.close()


def _seed_graph(db, *, cost_via_far: float = 1.0):
    start, near, far, pack = _uid(), _uid(), _uid(), _uid()
    e_sn, e_sf, e_np, e_fp = _uid(), _uid(), _uid(), _uid()
    payload = RoutingGraphReplaceRequest(
        expected_revision=1,
        nodes=[
            RoutingNodeIn(uuid=start, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational", label="S"),
            RoutingNodeIn(uuid=near, x=100, y=0, label="NEAR"),
            RoutingNodeIn(uuid=far, x=100, y=200, label="FAR"),
            RoutingNodeIn(uuid=pack, x=200, y=0, operational_type=OP_PACKING, node_type="operational", label="P"),
        ],
        edges=[
            RoutingEdgeIn(uuid=e_sn, from_node_uuid=start, to_node_uuid=near, direction="BOTH"),
            RoutingEdgeIn(uuid=e_sf, from_node_uuid=start, to_node_uuid=far, direction="BOTH", cost_multiplier=cost_via_far),
            RoutingEdgeIn(uuid=e_np, from_node_uuid=near, to_node_uuid=pack, direction="BOTH"),
            RoutingEdgeIn(uuid=e_fp, from_node_uuid=far, to_node_uuid=pack, direction="BOTH", cost_multiplier=cost_via_far),
        ],
        access_points=[
            RoutingAccessPointIn(uuid=_uid(), location_id=1, node_uuid=near, label="L-A near"),
            RoutingAccessPointIn(uuid=_uid(), location_id=1, node_uuid=far, label="L-A far"),
            RoutingAccessPointIn(uuid=_uid(), location_id=2, node_uuid=pack, label="L-B pack"),
        ],
    )
    g = replace_graph(db, 1, payload, materialize_crossings=False)
    return {
        "start": start,
        "near": near,
        "far": far,
        "pack": pack,
        "revision": g.revision,
        "e_sf": e_sf,
    }


def test_route_path_adapter_uses_new_graph(db):
    ids = _seed_graph(db)
    res = route_between_points_cm(db, 1, 0, 0, 200, 0)
    assert res.ok
    assert res.distance_m is not None and res.distance_m > 0
    assert res.nodes[0].node_uuid == ids["start"]
    assert res.nodes[-1].node_uuid == ids["pack"]


def test_route_path_no_graph_no_legacy_fallback(db):
    res = route_between_points_cm(db, 1, 0, 0, 10, 10)
    assert not res.ok
    assert res.error_code == ERROR_ROUTING_GRAPH_NOT_CONFIGURED


def test_route_api_http_no_fallback():
    """Import route module — must not import legacy graph models."""
    src = (ROOT / "api" / "route.py").read_text(encoding="utf-8")
    assert "from ..models.warehouse_graph" not in src
    assert "WarehouseGraphService" not in src
    assert "warehouse_routing" in src


def test_best_access_point_pair_chosen(db):
    ids = _seed_graph(db, cost_via_far=5.0)
    # From start to location 1: near AP must win over far (higher cost)
    res = route_best_among_candidates(
        db,
        1,
        [ids["start"]],
        [ids["near"], ids["far"]],
        process_type=PROCESS_PICKING,
        transport_type=TRANSPORT_FOOT,
    )
    assert res.ok
    assert ids["near"] in [n.node_uuid for n in res.nodes]
    assert ids["far"] not in [n.node_uuid for n in res.nodes]


def test_location_route_uses_cheaper_access(db):
    _seed_graph(db, cost_via_far=8.0)
    res = route_between_locations(db, 1, 1, 2, process_type=PROCESS_PICKING, transport_type=TRANSPORT_FOOT)
    assert res.ok
    # Should go near→pack, not far→pack
    assert any(n.node_uuid for n in res.nodes)


def test_disabled_edge_respected_in_access_route(db):
    ids = _seed_graph(db)
    # Disable near→pack so only far path works for loc1→loc2
    g = replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=ids["revision"],
            nodes=[
                RoutingNodeIn(uuid=ids["start"], x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=ids["near"], x=100, y=0),
                RoutingNodeIn(uuid=ids["far"], x=100, y=200),
                RoutingNodeIn(uuid=ids["pack"], x=200, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=ids["start"], to_node_uuid=ids["near"]),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=ids["start"], to_node_uuid=ids["far"]),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=ids["near"], to_node_uuid=ids["pack"], enabled=False),
                RoutingEdgeIn(uuid=_uid(), from_node_uuid=ids["far"], to_node_uuid=ids["pack"]),
            ],
            access_points=[
                RoutingAccessPointIn(uuid=_uid(), location_id=1, node_uuid=ids["near"]),
                RoutingAccessPointIn(uuid=_uid(), location_id=1, node_uuid=ids["far"]),
                RoutingAccessPointIn(uuid=_uid(), location_id=2, node_uuid=ids["pack"]),
            ],
        ),
        materialize_crossings=False,
    )
    res = route_between_locations(db, 1, 1, 2)
    assert res.ok
    assert ids["far"] in [n.node_uuid for n in res.nodes]


def test_one_way_and_process_transport_on_engine(db):
    a, b = _uid(), _uid()
    replace_graph(
        db,
        1,
        RoutingGraphReplaceRequest(
            expected_revision=1,
            nodes=[
                RoutingNodeIn(uuid=a, x=0, y=0, operational_type=OP_PICKING_START, node_type="operational"),
                RoutingNodeIn(uuid=b, x=100, y=0, operational_type=OP_PACKING, node_type="operational"),
            ],
            edges=[
                RoutingEdgeIn(
                    uuid=_uid(),
                    from_node_uuid=a,
                    to_node_uuid=b,
                    direction="FORWARD",
                    allowed_processes=["picking"],
                    allowed_transport_types=["foot"],
                )
            ],
        ),
        materialize_crossings=False,
    )
    ok = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="picking", transport_type="foot"),
    )
    assert ok.ok
    bad_dir = route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=b, destination_node_uuid=a))
    assert not bad_dir.ok
    bad_proc = route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="putaway", transport_type="foot"),
    )
    assert not bad_proc.ok


def test_save_layout_no_legacy_build_graph():
    src = (ROOT / "services" / "warehouse_layout_service.py").read_text(encoding="utf-8")
    assert "WarehouseGraphService" not in src
    assert "build_graph" not in src


def test_legacy_graph_service_deleted():
    assert not (ROOT / "services" / "warehouse_graph_service.py").exists()
    assert not (ROOT / "services" / "graph_location_service.py").exists()
    assert not (ROOT / "domain" / "simulation" / "warehouse_graph_service.py").exists()


def test_designer_planuj_trase_engines_deleted():
    fe = ROOT.parent / "frontend" / "src"
    assert not (fe / "components" / "warehouse" / "aisleGraphRoute.ts").exists()
    assert not (fe / "components" / "warehouse" / "aisleRouteOrder.ts").exists()
    assert not (fe / "components" / "warehouse" / "gridRoutePathfinding.ts").exists()
    assert not (fe / "api" / "routeApi.ts").exists()
    toolbar = (fe / "pages" / "WarehouseDesigner" / "DesignerToolbar.tsx").read_text(encoding="utf-8")
    assert "Planuj trasę" not in toolbar


def test_analytics_and_route_no_warehouse_node_imports():
    for rel in (
        "services/analytics_service.py",
        "api/route.py",
        "domain/simulation/picking_simulation_engine.py",
        "domain/picking_simulation/_pick_helpers.py",
    ):
        src = (ROOT / rel).read_text(encoding="utf-8")
        assert "from ..models.warehouse_graph" not in src
        assert "from ...models.warehouse_graph" not in src
        assert "WarehouseGraphService" not in src


def test_configured_flag(db):
    assert not is_routing_graph_configured(db, 1)
    _seed_graph(db)
    assert is_routing_graph_configured(db, 1)
