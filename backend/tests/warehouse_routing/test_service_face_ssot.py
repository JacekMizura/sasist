"""Service-face SSOT + deterministic row_containers repair."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.warehouse import Bin, Rack, Warehouse, WarehouseLayout
from backend.services.warehouse_routing.rack_service_face import (
    encode_face_for_world_normal,
    face_for_cardinal,
    normals_are_opposite,
    world_service_normal,
)
from backend.services.warehouse_routing.service_face_repair import repair_layout_service_faces


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
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_world_normals_cardinals_vertical():
    assert world_service_normal(orientation="vertical", rotation_degrees=0, service_side="FRONT").x == pytest.approx(-1)
    n = world_service_normal(orientation="vertical", rotation_degrees=90, service_side="FRONT")
    assert n.x == pytest.approx(0) and n.y == pytest.approx(-1)
    n = world_service_normal(orientation="vertical", rotation_degrees=270, service_side="FRONT")
    assert n.x == pytest.approx(0) and n.y == pytest.approx(1)
    n = world_service_normal(orientation="vertical", rotation_degrees=90, service_side="BACK")
    assert n.x == pytest.approx(0) and n.y == pytest.approx(1)


def test_world_normals_horizontal_front_back():
    n = world_service_normal(orientation="horizontal", rotation_degrees=0, service_side="FRONT")
    assert n.x == pytest.approx(0) and n.y == pytest.approx(1)
    n = world_service_normal(orientation="horizontal", rotation_degrees=0, service_side="BACK")
    assert n.x == pytest.approx(0) and n.y == pytest.approx(-1)
    n = world_service_normal(orientation="horizontal", rotation_degrees=180, service_side="FRONT")
    assert n.x == pytest.approx(0) and n.y == pytest.approx(-1)


def test_encode_roundtrip_0_90_180_270():
    for orient in ("vertical", "horizontal"):
        for nx, ny in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            face = encode_face_for_world_normal(nx, ny, orientation=orient)
            got = world_service_normal(
                orientation=orient,
                rotation_degrees=face.rotation_degrees,
                service_side=face.service_side,
            )
            assert got.x == pytest.approx(nx)
            assert got.y == pytest.approx(ny)


def test_back_to_back_faces_opposite():
    north = face_for_cardinal("NORTH", orientation="vertical")
    south = face_for_cardinal("SOUTH", orientation="vertical")
    a = world_service_normal(
        orientation="vertical",
        rotation_degrees=north.rotation_degrees,
        service_side=north.service_side,
    )
    b = world_service_normal(
        orientation="vertical",
        rotation_degrees=south.rotation_degrees,
        service_side=south.service_side,
    )
    assert normals_are_opposite(a, b)


def _rack(db, layout, *, name, uuid_s, x, y, w, h, rack_type="warehouse"):
    r = Rack(
        layout_id=layout.id,
        uuid=uuid_s,
        name=name,
        x=x,
        y=y,
        width=w,
        height=h,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
        is_active=True,
        service_side="FRONT",
        rotation_degrees=0,
        rack_type=rack_type,
    )
    db.add(r)
    db.flush()
    return r


def test_repair_abc_layout_like_prod(db):
    wh = Warehouse(name="W", tenant_id=1)
    db.add(wh)
    db.flush()
    a_uuid = str(uuid.uuid4())
    b_uuid = str(uuid.uuid4())
    c_uuid = str(uuid.uuid4())
    s_uuid = str(uuid.uuid4())
    containers = [
        {
            "id": "row-A",
            "rowPrefix": "A",
            "orientation": "horizontal",
            "slots": [{"x": 0, "y": 1, "w": 12, "h": 6, "rackId": a_uuid}],
        },
        {
            "id": "row-B",
            "rowPrefix": "B",
            "orientation": "horizontal",
            "slots": [{"x": 1, "y": 21, "w": 15, "h": 8, "rackId": b_uuid}],
        },
        {
            "id": "row-C",
            "rowPrefix": "C",
            "orientation": "horizontal",
            "bin_direction": "RTL",
            "slots": [{"x": 1, "y": 29, "w": 15, "h": 8, "rackId": c_uuid}],
        },
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id,
        name="L1",
        grid_cols=120,
        grid_rows=80,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()
    a = _rack(db, layout, name="A1", uuid_s=a_uuid, x=0, y=1, w=12, h=6)
    b = _rack(db, layout, name="B1", uuid_s=b_uuid, x=1, y=21, w=15, h=8)
    c = _rack(db, layout, name="C1", uuid_s=c_uuid, x=1, y=29, w=15, h=8)
    s = _rack(db, layout, name="S1", uuid_s=s_uuid, x=0, y=50, w=12, h=8, rack_type="store")
    db.commit()

    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()

    assert a.rotation_degrees in (90, 270)
    na = world_service_normal(
        orientation=a.orientation, rotation_degrees=a.rotation_degrees, service_side=a.service_side
    )
    nb = world_service_normal(
        orientation=b.orientation, rotation_degrees=b.rotation_degrees, service_side=b.service_side
    )
    nc = world_service_normal(
        orientation=c.orientation, rotation_degrees=c.rotation_degrees, service_side=c.service_side
    )
    # A faces south (toward B aisle), B north, C south — opposite B/C
    assert na.y == pytest.approx(1.0)  # SOUTH
    assert nb.y == pytest.approx(-1.0)  # NORTH
    assert nc.y == pytest.approx(1.0)  # SOUTH
    assert normals_are_opposite(nb, nc)
    # Store uses same SSOT — infer NORTH from C aisle gap (not skipped forever).
    ns = world_service_normal(
        orientation=s.orientation, rotation_degrees=s.rotation_degrees, service_side=s.service_side
    )
    assert ns.y == pytest.approx(-1.0)  # NORTH toward packing corridor / C gap
    assert any(r.get("name") == "S1" and r.get("changed") for r in report.repaired)
    assert report.deterministic_count >= 4


def test_repair_does_not_override_explicit_face(db):
    wh = Warehouse(name="X", tenant_id=1)
    db.add(wh)
    db.flush()
    u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
    containers = [
        {"id": "b", "orientation": "horizontal", "slots": [{"x": 0, "y": 10, "w": 10, "h": 8, "rackId": u1}]},
        {"id": "c", "orientation": "horizontal", "slots": [{"x": 0, "y": 18, "w": 10, "h": 8, "rackId": u2}]},
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=40, grid_rows=40,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()
    b = _rack(db, layout, name="B", uuid_s=u1, x=0, y=10, w=10, h=8)
    c = _rack(db, layout, name="C", uuid_s=u2, x=0, y=18, w=10, h=8)
    b.service_side = "BACK"
    b.rotation_degrees = 90
    db.commit()
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    assert b.service_side == "BACK" and int(b.rotation_degrees) == 90
    assert any(x.get("reason") == "explicit_ssot_preserved" for x in report.skipped_explicit)
    assert any(r.get("name") == "C" and r.get("changed") for r in report.repaired)


def test_fe_be_world_normal_matrix_contract():
    """Every orientation × side × rotation must match FE rackServiceFace.ts formulas."""

    def fe_local(orientation: str):
        return (0.0, 1.0) if orientation == "horizontal" else (-1.0, 0.0)

    def fe_rot(v, deg):
        d = deg % 360
        x, y = v
        if d == 0:
            return x, y
        if d == 90:
            return -y, x
        if d == 180:
            return -x, -y
        if d == 270:
            return y, -x
        return x, y

    def fe_world(orientation, rot, side):
        n = fe_rot(fe_local(orientation), rot)
        if side == "BACK":
            n = (-n[0], -n[1])
        mag = (n[0] ** 2 + n[1] ** 2) ** 0.5 or 1.0
        return n[0] / mag, n[1] / mag

    for orient in ("vertical", "horizontal"):
        for side in ("FRONT", "BACK"):
            for rot in (0, 90, 180, 270):
                be = world_service_normal(orientation=orient, rotation_degrees=rot, service_side=side)
                fx, fy = fe_world(orient, rot, side)
                assert be.x == pytest.approx(fx), (orient, side, rot)
                assert be.y == pytest.approx(fy), (orient, side, rot)


def test_repair_idempotent(db):
    wh = Warehouse(name="W2", tenant_id=1)
    db.add(wh)
    db.flush()
    u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
    containers = [
        {"id": "b", "orientation": "horizontal", "slots": [{"x": 0, "y": 10, "w": 10, "h": 8, "rackId": u1}]},
        {"id": "c", "orientation": "horizontal", "slots": [{"x": 0, "y": 18, "w": 10, "h": 8, "rackId": u2}]},
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id,
        name="L",
        grid_cols=40,
        grid_rows=40,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()
    _rack(db, layout, name="B", uuid_s=u1, x=0, y=10, w=10, h=8)
    _rack(db, layout, name="C", uuid_s=u2, x=0, y=18, w=10, h=8)
    db.commit()
    r1 = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    r2 = repair_layout_service_faces(db, wh.id, layout=layout)
    assert r1.deterministic_count >= 2
    assert r2.deterministic_count == 0
    assert r2.repaired == []
    assert len(r2.skipped_matching) >= 2


def test_legal_front0_west_preserved(db):
    """FRONT+0 is legitimate SSOT for vertical WEST; repair must not overwrite it."""
    wh = Warehouse(name="WestLegal", tenant_id=1)
    db.add(wh)
    db.flush()
    west_u, east_u = str(uuid.uuid4()), str(uuid.uuid4())
    # Two vertical rows back-to-back in X → west band expected WEST = FRONT+0.
    containers = [
        {
            "id": "west",
            "orientation": "vertical",
            "slots": [{"x": 0, "y": 0, "w": 8, "h": 20, "rackId": west_u}],
        },
        {
            "id": "east",
            "orientation": "vertical",
            "slots": [{"x": 8, "y": 0, "w": 8, "h": 20, "rackId": east_u}],
        },
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id,
        name="L",
        grid_cols=40,
        grid_rows=40,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()
    west = _rack(db, layout, name="W1", uuid_s=west_u, x=0, y=0, w=8, h=20)
    east = _rack(db, layout, name="E1", uuid_s=east_u, x=8, y=0, w=8, h=20)
    assert west.service_side == "FRONT" and int(west.rotation_degrees or 0) == 0
    west_face = face_for_cardinal("WEST", orientation="vertical")
    assert west_face.service_side == "FRONT" and west_face.rotation_degrees == 0
    db.commit()

    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()

    assert west.service_side == "FRONT"
    assert int(west.rotation_degrees or 0) == 0
    assert any(
        x.get("name") == "W1" and x.get("reason") == "matches_deterministic_expected"
        for x in report.skipped_matching
    )
    # East starts FRONT+0 but expected EAST (FRONT+180) → legacy mismatch repaired.
    assert int(east.rotation_degrees or 0) == 180
    assert any(r.get("name") == "E1" and r.get("changed") for r in report.repaired)


def test_legacy_wrong_front0_repaired(db):
    """Old wrong FRONT+0 in deterministic horizontal pair → corrected."""
    wh = Warehouse(name="LegacyWrong", tenant_id=1)
    db.add(wh)
    db.flush()
    u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
    containers = [
        {"id": "b", "orientation": "horizontal", "slots": [{"x": 0, "y": 10, "w": 10, "h": 8, "rackId": u1}]},
        {"id": "c", "orientation": "horizontal", "slots": [{"x": 0, "y": 18, "w": 10, "h": 8, "rackId": u2}]},
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=40, grid_rows=40,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()
    b = _rack(db, layout, name="B", uuid_s=u1, x=0, y=10, w=10, h=8)
    c = _rack(db, layout, name="C", uuid_s=u2, x=0, y=18, w=10, h=8)
    db.commit()
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    nb = world_service_normal(
        orientation=b.orientation, rotation_degrees=b.rotation_degrees, service_side=b.service_side
    )
    nc = world_service_normal(
        orientation=c.orientation, rotation_degrees=c.rotation_degrees, service_side=c.service_side
    )
    assert nb.y == pytest.approx(-1.0)
    assert nc.y == pytest.approx(1.0)
    assert report.deterministic_count == 2


def test_explicit_non_default_not_changed(db):
    wh = Warehouse(name="Explicit", tenant_id=1)
    db.add(wh)
    db.flush()
    u1, u2 = str(uuid.uuid4()), str(uuid.uuid4())
    containers = [
        {"id": "b", "orientation": "horizontal", "slots": [{"x": 0, "y": 10, "w": 10, "h": 8, "rackId": u1}]},
        {"id": "c", "orientation": "horizontal", "slots": [{"x": 0, "y": 18, "w": 10, "h": 8, "rackId": u2}]},
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=40, grid_rows=40,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()
    b = _rack(db, layout, name="B", uuid_s=u1, x=0, y=10, w=10, h=8)
    _rack(db, layout, name="C", uuid_s=u2, x=0, y=18, w=10, h=8)
    b.service_side = "BACK"
    b.rotation_degrees = 90
    db.commit()
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    assert b.service_side == "BACK" and int(b.rotation_degrees) == 90
    assert any(x.get("reason") == "explicit_ssot_preserved" for x in report.skipped_explicit)


def test_unknown_not_in_row_container_not_guessed(db):
    """FRONT+0 rack outside row_containers must stay FRONT+0 (no guess)."""
    wh = Warehouse(name="Unknown", tenant_id=1)
    db.add(wh)
    db.flush()
    lone = str(uuid.uuid4())
    layout = WarehouseLayout(
        warehouse_id=wh.id,
        name="L",
        grid_cols=40,
        grid_rows=40,
        row_containers_json=json.dumps([]),
    )
    db.add(layout)
    db.flush()
    r = _rack(db, layout, name="X1", uuid_s=lone, x=5, y=5, w=10, h=8)
    db.commit()
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    assert r.service_side == "FRONT"
    assert int(r.rotation_degrees or 0) == 0
    assert report.deterministic_count == 0
    assert report.repaired == []
    assert any(x.get("name") == "X1" and x.get("reason") == "not_in_row_container" for x in report.unresolved)


def test_should_repair_gate_unit():
    from types import SimpleNamespace

    from backend.services.warehouse_routing.service_face_repair import should_repair_legacy_mismatch

    west = face_for_cardinal("WEST", orientation="vertical")
    south = face_for_cardinal("SOUTH", orientation="vertical")
    legal = SimpleNamespace(service_side="FRONT", rotation_degrees=0, rack_type="warehouse")
    assert should_repair_legacy_mismatch(legal, west, orientation="vertical") is False
    assert should_repair_legacy_mismatch(legal, south, orientation="vertical") is True
    explicit = SimpleNamespace(service_side="BACK", rotation_degrees=90, rack_type="warehouse")
    assert should_repair_legacy_mismatch(explicit, south, orientation="vertical") is False
    store = SimpleNamespace(service_side="FRONT", rotation_degrees=0, rack_type="store")
    # Row-band gate still skips store; store uses dedicated _apply_store_face path.
    assert should_repair_legacy_mismatch(store, south, orientation="vertical") is False

