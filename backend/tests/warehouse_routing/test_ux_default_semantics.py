"""UX semantics: empty process/transport restrictions = ALL (shared warehouse network)."""

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
    RoutingEdgeIn,
    RoutingGraphReplaceRequest,
    RoutingNodeIn,
)
from backend.services.warehouse_routing import replace_graph, route_a_to_b
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


def test_default_edge_allows_any_process_and_transport(db):
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
                    allowed_processes=[],
                    allowed_transport_types=[],
                )
            ],
        ),
        materialize_crossings=False,
    )
    # No filter
    assert route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b)).ok
    # Explicit process/transport still allowed on unrestricted edge
    assert route_a_to_b(
        db,
        1,
        RouteComputeRequest(
            start_node_uuid=a,
            destination_node_uuid=b,
            process_type="picking",
            transport_type="foot",
        ),
    ).ok
    assert route_a_to_b(
        db,
        1,
        RouteComputeRequest(
            start_node_uuid=a,
            destination_node_uuid=b,
            process_type="putaway",
            transport_type="forklift",
        ),
    ).ok
    assert route_a_to_b(
        db,
        1,
        RouteComputeRequest(
            start_node_uuid=a,
            destination_node_uuid=b,
            process_type="replenishment",
            transport_type="cart",
        ),
    ).ok


def test_restricted_process_blocks_others(db):
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
                    allowed_processes=["replenishment"],
                    allowed_transport_types=[],
                )
            ],
        ),
        materialize_crossings=False,
    )
    # Unfiltered test (no process) still uses the edge — optional restriction only when filter set
    assert route_a_to_b(db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b)).ok
    assert route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="replenishment"),
    ).ok
    assert not route_a_to_b(
        db,
        1,
        RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, process_type="picking"),
    ).ok


def test_restricted_transport_blocks_others(db):
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
                    allowed_processes=[],
                    allowed_transport_types=["foot"],
                )
            ],
        ),
        materialize_crossings=False,
    )
    assert route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, transport_type="foot")
    ).ok
    assert not route_a_to_b(
        db, 1, RouteComputeRequest(start_node_uuid=a, destination_node_uuid=b, transport_type="forklift")
    ).ok
