"""Location Access Foundation — geometry, rack link SSOT, virtual entry."""

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
from backend.services.warehouse_routing.engine import route_via_virtual_entries
from backend.services.warehouse_routing.location_access_geometry import (
    RackFootprint,
    Vec2,
    select_best_edge_for_service_point,
    service_edge_point_cm,
    world_service_normal,
    rack_footprint_cm,
)
from backend.services.warehouse_routing.location_access_resolver import (
    BINDING_AUTO,
    BINDING_MANUAL_OVERRIDE,
    STATUS_RESOLVED,
    migrate_access_points_to_overrides,
    recompute_location_access,
    resolve_auto_for_location,
)
from backend.services.warehouse_routing.location_access_service import restore_auto, set_manual_override
from backend.services.warehouse_routing.location_rack_link import resolve_rack_for_location


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    Warehouse.__table__.create(engine, checkfirst=True)
    WarehouseLayout.__table__.create(engine, checkfirst=True)
    Rack.__table__.create(engine, checkfirst=True)
    Bin.__table__.create(engine, checkfirst=True)
    Location.__table__.create(engine, checkfirst=True)
    WarehouseRoutingNode.__table__.create(engine, checkfirst=True)
    WarehouseRoutingEdge.__table__.create(engine, checkfirst=True)
    WarehouseRoutingAccessPoint.__table__.create(engine, checkfirst=True)
    WarehouseRoutingLocationAccess.__table__.create(engine, checkfirst=True)
    WarehouseRoutingGraphMeta.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _wh(db) -> Warehouse:
    w = Warehouse(name=f"T-{uuid.uuid4().hex[:6]}", tenant_id=1)
    db.add(w)
    db.flush()
    return w


def _layout_with_rack(
    db,
    warehouse: Warehouse,
    *,
    orientation: str = "horizontal",
    rotation_degrees: int = 0,
    service_side: str = "FRONT",
    x: int = 10,
    y: int = 10,
    width: int = 10,
    height: int = 4,
) -> tuple[WarehouseLayout, Rack, Location]:
    layout = WarehouseLayout(
        warehouse_id=warehouse.id,
        name="L1",
        grid_cols=100,
        grid_rows=100,
        width_m=10,
        length_m=10,
    )
    db.add(layout)
    db.flush()
    rack_uuid = str(uuid.uuid4())
    rack = Rack(
        layout_id=layout.id,
        uuid=rack_uuid,
        name="A1",
        x=x,
        y=y,
        width=width,
        height=height,
        orientation=orientation,
        levels=1,
        bins_per_level=1,
        length_cm=40.0,
        width_cm=100.0,
        height_cm=200.0,
        aisle_letter="A",
        rack_index=1,
        service_side=service_side,
        rotation_degrees=rotation_degrees,
    )
    db.add(rack)
    db.flush()
    loc_uuid = str(uuid.uuid4())
    bin_row = Bin(
        rack_id=rack.id,
        location_uuid=loc_uuid,
        label="A1-01",
        level_index=0,
        segment_index=0,
        volume_dm3=10,
    )
    db.add(bin_row)
    # Center roughly in footprint
    cx = (x + width / 2) * 10
    cy = (y + height / 2) * 10
    loc = Location(
        warehouse_id=warehouse.id,
        name="A1-01",
        location_uuid=loc_uuid,
        type="pick",
        rack_name="A1",
        x=cx,
        y=cy,
        z=0,
    )
    db.add(loc)
    db.flush()
    return layout, rack, loc


def _road(db, warehouse_id: int, ax: float, ay: float, bx: float, by: float) -> WarehouseRoutingEdge:
    na, nb = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(WarehouseRoutingNode(uuid=na, warehouse_id=warehouse_id, x=ax, y=ay, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=nb, warehouse_id=warehouse_id, x=bx, y=by, node_type="junction"))
    e = WarehouseRoutingEdge(
        uuid=str(uuid.uuid4()),
        warehouse_id=warehouse_id,
        from_node_uuid=na,
        to_node_uuid=nb,
        distance_m=((bx - ax) ** 2 + (by - ay) ** 2) ** 0.5 / 100.0,
        direction="BOTH",
        enabled=True,
    )
    db.add(e)
    db.flush()
    return e


def test_location_rack_link_uses_uuid_not_name(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w)
    loc.rack_name = "RENAMED"
    db.flush()
    linked = resolve_rack_for_location(db, loc)
    assert linked is not None
    assert linked.id == rack.id
    assert linked.uuid == rack.uuid


def test_rename_rack_does_not_break_link(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w)
    rack.name = "Z99"
    loc.rack_name = "stale"
    db.flush()
    assert resolve_rack_for_location(db, loc).id == rack.id


def test_world_normal_horizontal_front_and_rotated_180():
    rack = Rack(
        layout_id=1,
        x=0,
        y=0,
        width=10,
        height=4,
        orientation="horizontal",
        length_cm=40,
        width_cm=100,
        service_side="FRONT",
        rotation_degrees=0,
    )
    n0 = world_service_normal(rack)
    assert abs(n0.x) < 1e-6 and n0.y > 0.9
    rack.rotation_degrees = 180
    n180 = world_service_normal(rack)
    assert abs(n180.x) < 1e-6 and n180.y < -0.9


def test_service_edge_point_on_face(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w, orientation="horizontal", rotation_degrees=0)
    S = service_edge_point_cm(rack, float(loc.x), float(loc.y))
    fp = rack_footprint_cm(rack)
    assert abs(S.y - fp.max_y) < 1e-6
    assert fp.min_x <= S.x <= fp.max_x


def test_auto_picks_road_on_service_side_not_opposite(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w, orientation="horizontal", x=10, y=10, width=10, height=4)
    # Service face = +Y (south). Road on south side vs north side.
    south = _road(db, w.id, 100, 160, 220, 160)  # below rack (y=10..14 → 100..140 cm)
    north = _road(db, w.id, 100, 60, 220, 60)  # above rack
    result = resolve_auto_for_location(db, w.id, loc)
    assert result.status in (STATUS_RESOLVED, "AMBIGUOUS", "OK", "REVIEW")
    assert result.edge_uuid == south.uuid
    assert result.edge_uuid != north.uuid


def test_back_to_back_two_racks_do_not_cross_assign(db):
    w = _wh(db)
    # Rack A faces +Y, rack B faces -Y (rotation 180), stacked
    layout, rack_a, loc_a = _layout_with_rack(
        db, w, orientation="horizontal", rotation_degrees=0, x=10, y=10, width=10, height=4
    )
    rack_b = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="B1",
        x=10,
        y=14,
        width=10,
        height=4,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=40,
        width_cm=100,
        height_cm=200,
        aisle_letter="B",
        rack_index=2,
        service_side="FRONT",
        rotation_degrees=180,
    )
    db.add(rack_b)
    db.flush()
    loc_b_uuid = str(uuid.uuid4())
    db.add(
        Bin(
            rack_id=rack_b.id,
            location_uuid=loc_b_uuid,
            label="B1-01",
            level_index=0,
            segment_index=0,
            volume_dm3=10,
        )
    )
    loc_b = Location(
        warehouse_id=w.id,
        name="B1-01",
        location_uuid=loc_b_uuid,
        type="pick",
        x=150,
        y=160,
        z=0,
    )
    db.add(loc_b)
    db.flush()

    road_south = _road(db, w.id, 100, 200, 220, 200)  # aisle south of A (and "north" of B if B at y=14)
    road_north = _road(db, w.id, 100, 80, 220, 80)  # aisle north of B after 180

    ra = resolve_auto_for_location(db, w.id, loc_a)
    rb = resolve_auto_for_location(db, w.id, loc_b)
    assert ra.edge_uuid == road_south.uuid
    assert rb.edge_uuid == road_north.uuid
    assert ra.edge_uuid != rb.edge_uuid


def test_max_reach_rejects_far_road(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w)
    _road(db, w.id, 100, 900, 220, 900)  # ~7.5m+ away from face
    result = resolve_auto_for_location(db, w.id, loc, max_reach_m=3.0)
    assert result.status == "UNREACHABLE"
    assert result.edge_uuid is None


def test_virtual_entry_adds_approach_cost(db):
    w = _wh(db)
    e = _road(db, w.id, 0, 0, 1000, 0)  # 10m edge
    # Two entries on same edge
    resp = route_via_virtual_entries(
        db,
        w.id,
        start_edge_uuid=e.uuid,
        start_t=0.1,
        start_approach_m=1.5,
        dest_edge_uuid=e.uuid,
        dest_t=0.9,
        dest_approach_m=2.0,
    )
    assert resp.ok
    # Graph portion ~8m + approaches 3.5m
    assert resp.distance_m is not None
    assert resp.distance_m == pytest.approx(8.0 + 3.5, abs=0.05)


def test_virtual_entry_does_not_persist_nodes(db):
    w = _wh(db)
    e = _road(db, w.id, 0, 0, 500, 0)
    before = db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == w.id).count()
    route_via_virtual_entries(
        db,
        w.id,
        start_edge_uuid=e.uuid,
        start_t=0.2,
        start_approach_m=0.5,
        dest_edge_uuid=e.uuid,
        dest_t=0.8,
        dest_approach_m=0.5,
    )
    after = db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == w.id).count()
    assert before == after == 2


def test_manual_override_preserved_on_recompute(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w)
    e = _road(db, w.id, 100, 160, 220, 160)
    set_manual_override(db, w.id, loc.id, edge_uuid=e.uuid, t=0.5)
    db.flush()
    recompute_location_access(db, w.id, migrate_aps=False)
    row = (
        db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.location_id == loc.id)
        .first()
    )
    assert row.binding_mode == BINDING_MANUAL_OVERRIDE
    assert row.edge_uuid == e.uuid


def test_restore_auto_clears_override(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w)
    e = _road(db, w.id, 100, 160, 220, 160)
    set_manual_override(db, w.id, loc.id, edge_uuid=e.uuid, t=0.25)
    row = restore_auto(db, w.id, loc.id)
    assert row.binding_mode == BINDING_AUTO
    assert row.legacy_node_uuid is None


def test_half_plane_filter_unit():
    S = Vec2(0, 0)
    n = Vec2(0, 1)
    edges = [
        ("bad", (-10.0, -50.0), (10.0, -50.0)),
        ("good", (-10.0, 50.0), (10.0, 50.0)),
    ]
    footprint = RackFootprint(-5, -5, 5, 5)
    best, reason = select_best_edge_for_service_point(S, n, footprint, edges, max_reach_m=10)
    assert reason == "OK"
    assert best is not None
    assert best.edge_uuid == "good"


def test_move_rack_keeps_uuid_link(db):
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w)
    rack.x = 50
    rack.y = 50
    loc.x = 550
    loc.y = 520
    db.flush()
    assert resolve_rack_for_location(db, loc).id == rack.id


def test_wrong_side_closer_road_loses_to_service_side(db):
    """Critical: nearer road BEHIND rack must lose to farther road in front."""
    w = _wh(db)
    _, rack, loc = _layout_with_rack(db, w, orientation="horizontal", x=10, y=10, width=10, height=4)
    behind = _road(db, w.id, 100, 130, 220, 130)
    front = _road(db, w.id, 100, 220, 220, 220)
    result = resolve_auto_for_location(db, w.id, loc)
    assert result.edge_uuid == front.uuid
    assert result.edge_uuid != behind.uuid


def test_vertical_front_and_back_normals():
    rack = Rack(
        layout_id=1,
        x=0,
        y=0,
        width=4,
        height=10,
        orientation="vertical",
        length_cm=40,
        width_cm=100,
        service_side="FRONT",
        rotation_degrees=0,
    )
    n = world_service_normal(rack)
    assert n.x < -0.9 and abs(n.y) < 1e-6
    rack.service_side = "BACK"
    nb = world_service_normal(rack)
    assert nb.x > 0.9
    rack.service_side = "FRONT"
    rack.rotation_degrees = 180
    n180 = world_service_normal(rack)
    assert n180.x > 0.9


def test_per_location_entries_differ_along_rack(db):
    w = _wh(db)
    _layout, rack, _ = _layout_with_rack(db, w, orientation="horizontal", x=10, y=10, width=20, height=4)
    road = _road(db, w.id, 80, 160, 320, 160)
    locs = []
    for i, cx in enumerate((110.0, 150.0, 190.0, 230.0)):
        u = str(uuid.uuid4())
        db.add(
            Bin(
                rack_id=rack.id,
                location_uuid=u,
                label=f"A{i + 1}",
                level_index=0,
                segment_index=i,
                volume_dm3=10,
            )
        )
        loc = Location(
            warehouse_id=w.id,
            name=f"A{i + 1}",
            location_uuid=u,
            type="pick",
            x=cx,
            y=120.0,
            z=0,
        )
        db.add(loc)
        locs.append(loc)
    db.flush()
    ts = []
    for loc in locs:
        r = resolve_auto_for_location(db, w.id, loc)
        assert r.edge_uuid == road.uuid
        assert r.t is not None
        ts.append(r.t)
    assert max(ts) - min(ts) > 0.15
    assert ts == sorted(ts)


def test_migrate_does_not_overwrite_restored_auto(db):
    from backend.models.warehouse_routing import WarehouseRoutingAccessPoint

    w = _wh(db)
    _, _rack, loc = _layout_with_rack(db, w)
    _road(db, w.id, 100, 160, 220, 160)
    node_uuid = (
        db.query(WarehouseRoutingNode)
        .filter(WarehouseRoutingNode.warehouse_id == w.id)
        .first()
        .uuid
    )
    db.add(
        WarehouseRoutingAccessPoint(
            uuid=str(uuid.uuid4()),
            warehouse_id=w.id,
            location_id=loc.id,
            node_uuid=node_uuid,
        )
    )
    db.flush()
    assert migrate_access_points_to_overrides(db, w.id) == 1
    row = restore_auto(db, w.id, loc.id)
    assert row.binding_mode == BINDING_AUTO
    assert migrate_access_points_to_overrides(db, w.id) == 0
    recompute_location_access(db, w.id, migrate_aps=True)
    row2 = (
        db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.location_id == loc.id)
        .first()
    )
    assert row2.binding_mode == BINDING_AUTO


def test_override_broken_when_edge_deleted(db):
    w = _wh(db)
    _, _rack, loc = _layout_with_rack(db, w)
    e = _road(db, w.id, 100, 160, 220, 160)
    set_manual_override(db, w.id, loc.id, edge_uuid=e.uuid, t=0.4)
    db.flush()
    db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.uuid == e.uuid).delete()
    db.flush()
    recompute_location_access(db, w.id, migrate_aps=False)
    row = (
        db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.location_id == loc.id)
        .first()
    )
    assert row.binding_mode == BINDING_MANUAL_OVERRIDE
    assert row.status == "OVERRIDE_BROKEN"


def test_one_way_same_edge_respects_t_order(db):
    w = _wh(db)
    e = _road(db, w.id, 0, 0, 1000, 0)
    e.direction = "FORWARD"
    db.flush()
    ok = route_via_virtual_entries(
        db,
        w.id,
        start_edge_uuid=e.uuid,
        start_t=0.2,
        start_approach_m=0.5,
        dest_edge_uuid=e.uuid,
        dest_t=0.8,
        dest_approach_m=0.5,
    )
    assert ok.ok
    bad = route_via_virtual_entries(
        db,
        w.id,
        start_edge_uuid=e.uuid,
        start_t=0.8,
        start_approach_m=0.5,
        dest_edge_uuid=e.uuid,
        dest_t=0.2,
        dest_approach_m=0.5,
    )
    assert not bad.ok


def test_graph_pollution_recompute_many_locations(db):
    w = _wh(db)
    _layout, rack, _ = _layout_with_rack(db, w)
    _road(db, w.id, 80, 160, 400, 160)
    n_before = db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == w.id).count()
    e_before = db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.warehouse_id == w.id).count()
    for i in range(40):
        u = str(uuid.uuid4())
        db.add(
            Bin(
                rack_id=rack.id,
                location_uuid=u,
                label=f"L{i}",
                level_index=0,
                segment_index=i % 8,
                volume_dm3=10,
            )
        )
        db.add(
            Location(
                warehouse_id=w.id,
                name=f"L{i}",
                location_uuid=u,
                type="pick",
                x=100.0 + i * 5,
                y=120.0,
                z=0,
            )
        )
    db.flush()
    recompute_location_access(db, w.id, migrate_aps=False)
    n_after = db.query(WarehouseRoutingNode).filter(WarehouseRoutingNode.warehouse_id == w.id).count()
    e_after = db.query(WarehouseRoutingEdge).filter(WarehouseRoutingEdge.warehouse_id == w.id).count()
    assert n_before == n_after
    assert e_before == e_after
    access_n = (
        db.query(WarehouseRoutingLocationAccess)
        .filter(WarehouseRoutingLocationAccess.warehouse_id == w.id)
        .count()
    )
    assert access_n >= 40


def test_layout_save_source_has_no_legacy_rebuild():
    from pathlib import Path

    src = (Path(__file__).resolve().parents[2] / "services" / "warehouse_layout_service.py").read_text(
        encoding="utf-8"
    )
    assert "WarehouseGraphService" not in src
    assert "build_graph" not in src
    assert "assign_locations_to_graph_nodes" not in src
    assert "recompute_location_access" in src
