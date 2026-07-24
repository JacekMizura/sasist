"""Regression: store rack S1 uses same service-face SSOT; legacy FRONT+0 repaired from aisle geometry."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.location import Location
from backend.models.warehouse import Bin, Rack, Warehouse, WarehouseLayout
from backend.models.warehouse_routing import (
    WarehouseRoutingAccessPoint,
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingLocationAccess,
    WarehouseRoutingNode,
)
from backend.services.warehouse_routing.location_access_resolver import (
    STATUS_BLOCKED,
    STATUS_RESOLVED,
    recompute_location_access,
    resolve_auto_for_location,
)
from backend.services.warehouse_routing.physical_collision import (
    build_rack_obstacle,
    segment_is_physically_clear,
)
from backend.services.warehouse_routing.rack_service_face import (
    face_for_cardinal,
    world_service_normal,
)
from backend.services.warehouse_routing.service_face_repair import (
    _infer_store_face_from_neighbors,
    repair_layout_service_faces,
)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    for t in (
        Warehouse,
        WarehouseLayout,
        Rack,
        Bin,
        Location,
        WarehouseRoutingNode,
        WarehouseRoutingEdge,
        WarehouseRoutingAccessPoint,
        WarehouseRoutingLocationAccess,
        WarehouseRoutingGraphMeta,
    ):
        t.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_store_s1_face_from_north_aisle_neighbor_and_access(db):
    """
    PROD WH1 shape (cells):
      C1 @ (1,29) 15×8  — north of store
      S1 @ (0,50) 12×8  store, legacy FRONT+0 → wrong WEST normal
      packing edge at y=490 cm along north corridor
    One legal service face (NORTH) is enough for store.
    """
    wh = Warehouse(name="WH-S1", tenant_id=1)
    db.add(wh)
    db.flush()
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=120, grid_rows=80, width_m=12, length_m=8
    )
    db.add(layout)
    db.flush()

    c1_uuid = str(uuid.uuid4())
    s1_uuid = str(uuid.uuid4())
    c1 = Rack(
        layout_id=layout.id,
        uuid=c1_uuid,
        name="C1",
        rack_type="warehouse",
        x=1,
        y=29,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=150,
        height_cm=200,
        service_side="FRONT",
        rotation_degrees=270,
        is_active=True,
    )
    c2_uuid = str(uuid.uuid4())
    c2 = Rack(
        layout_id=layout.id,
        uuid=c2_uuid,
        name="C2",
        rack_type="warehouse",
        x=16,
        y=29,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=150,
        height_cm=200,
        service_side="FRONT",
        rotation_degrees=270,
        is_active=True,
    )
    s1 = Rack(
        layout_id=layout.id,
        uuid=s1_uuid,
        name="S1",
        rack_type="store",
        x=0,
        y=50,
        width=12,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=3,
        length_cm=80,
        width_cm=120,
        height_cm=200,
        service_side="FRONT",
        rotation_degrees=0,
        is_active=True,
    )
    db.add_all([c1, c2, s1])
    db.flush()

    face = _infer_store_face_from_neighbors(s1, [c1, c2, s1])
    assert face is not None
    expected = face_for_cardinal("NORTH", orientation="vertical")
    assert face.service_side == expected.service_side
    assert face.rotation_degrees == expected.rotation_degrees
    n = world_service_normal(
        orientation="vertical",
        service_side=face.service_side,
        rotation_degrees=face.rotation_degrees,
    )
    assert abs(n.x) < 1e-6 and n.y < -0.5  # NORTH = (0, -1)

    report = repair_layout_service_faces(db, wh.id, layout=layout)
    assert any(r.get("name") == "S1" and r.get("changed") for r in report.repaired)
    db.flush()
    db.refresh(s1)
    assert int(s1.rotation_degrees or 0) == expected.rotation_degrees
    assert str(s1.service_side).upper() == expected.service_side

    # Locations on S1 (world cm = cells * 10)
    locs = []
    for i, name in enumerate(("A23-A-1", "A23-A-2", "A23-A-3"), start=1):
        loc_uuid = str(uuid.uuid4())
        b = Bin(
            rack_id=s1.id,
            location_uuid=loc_uuid,
            label=name,
            level_index=0,
            segment_index=i,
            volume_dm3=10,
            is_active=True,
        )
        db.add(b)
        db.flush()
        loc = Location(
            warehouse_id=wh.id,
            name=name,
            location_uuid=loc_uuid,
            location_type="NORMAL",
            type="pick",
            x=40.0,
            y=560.0,
            is_active=True,
        )
        db.add(loc)
        locs.append(loc)
    db.flush()

    # Packing corridor edge north of S1 (matches PROD y=490)
    na, nb = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(WarehouseRoutingNode(uuid=na, warehouse_id=wh.id, x=20.0, y=490.0, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=nb, warehouse_id=wh.id, x=750.0, y=490.0, node_type="junction"))
    edge = WarehouseRoutingEdge(
        uuid=str(uuid.uuid4()),
        warehouse_id=wh.id,
        from_node_uuid=na,
        to_node_uuid=nb,
        distance_m=7.3,
        direction="BOTH",
        enabled=True,
    )
    db.add(edge)
    db.add(WarehouseRoutingGraphMeta(warehouse_id=wh.id, revision=1))
    db.flush()

    # Before repair proof: wrong face → BLOCKED (re-apply legacy then resolve)
    s1.service_side = "FRONT"
    s1.rotation_degrees = 0
    db.flush()
    bad = resolve_auto_for_location(db, wh.id, locs[0], rack=s1)
    assert bad.status == STATUS_BLOCKED

    # After correct face
    s1.service_side = expected.service_side
    s1.rotation_degrees = expected.rotation_degrees
    db.flush()
    recompute_location_access(db, wh.id)
    for loc in locs:
        r = resolve_auto_for_location(db, wh.id, loc, rack=s1)
        assert r.status == STATUS_RESOLVED, (loc.name, r.status)
        assert r.edge_uuid == edge.uuid
        assert r.t is not None
        assert 0.0 <= float(r.t) <= 1.0
        assert r.entry_x_cm is not None and r.entry_y_cm is not None
        assert r.service_point_x_cm is not None and r.service_point_y_cm is not None
        # Approach must not cut through S1 footprint
        obst = [build_rack_obstacle(s1, [])]
        assert segment_is_physically_clear(
            float(r.service_point_x_cm),
            float(r.service_point_y_cm),
            float(r.entry_x_cm),
            float(r.entry_y_cm),
            obst,
        )
