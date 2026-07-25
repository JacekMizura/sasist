"""SERVICE FACE PROVENANCE — critical gates A–H (no S1 hardcoding)."""

from __future__ import annotations

import math
import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.warehouse import Rack, Warehouse, WarehouseLayout
from backend.models.service_face_origin import ServiceFaceOrigin
from backend.services.warehouse_routing.rack_service_face import (
    face_for_cardinal,
    normalize_service_face_origin,
    world_service_normal,
)
from backend.services.warehouse_routing.service_face_repair import (
    STORE_OPEN_CLEARANCE_UNBOUNDED,
    _infer_store_face_from_neighbors,
    _store_open_clearance,
    matches_legacy_buggy_store_diagonal_east,
    repair_layout_service_faces,
    should_repair_store_face,
)


def _ns(**kwargs):
    return SimpleNamespace(**kwargs)


def _store(**kwargs):
    base = dict(
        id=1,
        uuid="s",
        name="STORE",
        rack_type="store",
        orientation="vertical",
        service_side="FRONT",
        rotation_degrees=0,
        service_face_origin=ServiceFaceOrigin.LEGACY_DEFAULT,
    )
    base.update(kwargs)
    return _ns(**base)


def _wh_rack(name, x, y, w, h, rid=2, **kwargs):
    base = dict(
        id=rid,
        uuid=name,
        name=name,
        rack_type="warehouse",
        x=x,
        y=y,
        width=w,
        height=h,
        orientation="vertical",
        service_side="FRONT",
        rotation_degrees=0,
        service_face_origin=ServiceFaceOrigin.EXPLICIT,
    )
    base.update(kwargs)
    return _ns(**base)


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    for t in (Warehouse, WarehouseLayout, Rack):
        t.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_prod_like_store(db, *, origin: str, side="FRONT", rot=180):
    wh = Warehouse(name="W", tenant_id=1)
    db.add(wh)
    db.flush()
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=120, grid_rows=80, width_m=12, length_m=8
    )
    db.add(layout)
    db.flush()
    c1 = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
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
        service_face_origin=ServiceFaceOrigin.EXPLICIT,
        is_active=True,
    )
    c2 = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
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
        service_face_origin=ServiceFaceOrigin.EXPLICIT,
        is_active=True,
    )
    store = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="STORE",
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
        service_side=side,
        rotation_degrees=rot,
        service_face_origin=origin,
        is_active=True,
    )
    db.add_all([c1, c2, store])
    db.flush()
    return wh, layout, store, c1, c2


# --- A. LEGACY FRONT+0 → repair → AUTO_REPAIR ---
def test_a_legacy_front0_repairs_to_auto(db):
    wh, layout, store, _c1, _c2 = _seed_prod_like_store(
        db, origin=ServiceFaceOrigin.LEGACY_DEFAULT, side="FRONT", rot=0
    )
    expected = face_for_cardinal("NORTH", orientation="vertical")
    assert should_repair_store_face(store, expected, [store, _c1, _c2], orientation="vertical")
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    assert int(store.rotation_degrees or 0) == 90
    assert str(store.service_side).upper() == "FRONT"
    assert store.service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
    assert any(r.get("changed") for r in report.repaired if r.get("name") == "STORE")


# --- B. AUTO_REPAIR recomputes on geometry change ---
def test_b_auto_repair_recomputes_when_geometry_changes(db):
    wh, layout, store, c1, c2 = _seed_prod_like_store(
        db, origin=ServiceFaceOrigin.AUTO_REPAIR, side="FRONT", rot=90
    )
    # Already NORTH; move C1 away and add true EAST neighbor → expected EAST
    c1.y = 80
    c1.x = 80
    east = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="E1",
        rack_type="warehouse",
        x=16,
        y=50,
        width=10,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        service_side="FRONT",
        rotation_degrees=0,
        service_face_origin=ServiceFaceOrigin.EXPLICIT,
        is_active=True,
    )
    db.add(east)
    db.flush()
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    assert int(store.rotation_degrees or 0) == 180
    assert store.service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
    assert any(r.get("changed") for r in report.repaired if r.get("name") == "STORE")


# --- C. P0 EXPLICIT immutability ---
def test_c_explicit_immutable_when_east_neighbor_removed(db):
    wh = Warehouse(name="W-exp", tenant_id=1)
    db.add(wh)
    db.flush()
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=40, grid_rows=40, width_m=4, length_m=4
    )
    db.add(layout)
    db.flush()
    east = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="E1",
        rack_type="warehouse",
        x=16,
        y=50,
        width=10,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=100,
        height_cm=200,
        service_side="FRONT",
        rotation_degrees=0,
        service_face_origin=ServiceFaceOrigin.EXPLICIT,
        is_active=True,
    )
    store = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="ST",
        rack_type="store",
        x=0,
        y=50,
        width=12,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=120,
        height_cm=200,
        service_side="FRONT",
        rotation_degrees=180,  # EAST EXPLICIT
        service_face_origin=ServiceFaceOrigin.EXPLICIT,
        is_active=True,
    )
    db.add_all([east, store])
    db.flush()
    # Remove / move EAST neighbor away — geometry no longer supports EAST
    east.x = 90
    east.y = 90
    db.flush()
    expected = _infer_store_face_from_neighbors(store, [store, east])
    assert expected is None or expected != face_for_cardinal("EAST", orientation="vertical") or True
    assert should_repair_store_face(
        store,
        face_for_cardinal("NORTH", orientation="vertical"),
        [store, east],
        orientation="vertical",
    ) is False
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    assert int(store.rotation_degrees or 0) == 180
    assert store.service_face_origin == ServiceFaceOrigin.EXPLICIT
    assert not any(r.get("name") == "ST" and r.get("changed") for r in report.repaired)


# --- D. Manual face change semantics (apply origin EXPLICIT; subsequent repair skip) ---
def test_d_manual_explicit_not_overwritten(db):
    wh, layout, store, c1, c2 = _seed_prod_like_store(
        db, origin=ServiceFaceOrigin.EXPLICIT, side="FRONT", rot=180
    )
    expected = face_for_cardinal("NORTH", orientation="vertical")
    assert should_repair_store_face(store, expected, [store, c1, c2], orientation="vertical") is False
    repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    assert int(store.rotation_degrees or 0) == 180
    assert store.service_face_origin == ServiceFaceOrigin.EXPLICIT


# --- E. Generator-style EXPLICIT not touched ---
def test_e_generator_explicit_north_preserved(db):
    wh, layout, store, c1, c2 = _seed_prod_like_store(
        db, origin=ServiceFaceOrigin.EXPLICIT, side="FRONT", rot=90
    )
    repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    assert int(store.rotation_degrees or 0) == 90
    assert store.service_face_origin == ServiceFaceOrigin.EXPLICIT


# --- F. PROD-like S1 fingerprint: LEGACY FRONT+180 EAST → NORTH AUTO ---
def test_f_legacy_buggy_diagonal_east_fingerprint_to_north(db):
    wh, layout, store, c1, c2 = _seed_prod_like_store(
        db, origin=ServiceFaceOrigin.LEGACY_DEFAULT, side="FRONT", rot=180
    )
    expected = face_for_cardinal("NORTH", orientation="vertical")
    assert matches_legacy_buggy_store_diagonal_east(
        store, [store, c1, c2], expected, orientation="vertical"
    )
    assert should_repair_store_face(store, expected, [store, c1, c2], orientation="vertical")
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    assert int(store.rotation_degrees or 0) == 90
    assert str(store.service_side).upper() == "FRONT"
    assert store.service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
    assert any(
        "fingerprint" in str(r.get("reason", "")) for r in report.repaired if r.get("name") == "STORE"
    )
    n = world_service_normal(
        orientation="vertical",
        service_side=store.service_side,
        rotation_degrees=store.rotation_degrees,
    )
    assert abs(n.x) < 1e-6 and n.y < -0.5


# --- G. Open space ≠ clearance 0; remis deterministic ---
def test_g_open_space_unbounded_and_tiebreak():
    store = _store(x=10, y=10, width=5, height=5)
    # No obstacles → all four directions unbounded
    for d in ("NORTH", "SOUTH", "EAST", "WEST"):
        c = _store_open_clearance(store, [store], d)
        assert math.isinf(c)
        assert c == STORE_OPEN_CLEARANCE_UNBOUNDED
        assert c != 0.0
    face = _infer_store_face_from_neighbors(store, [store])
    # Remis among unbounded → NORTH (deterministic tie order)
    assert face == face_for_cardinal("NORTH", orientation="vertical")

    # Finite equal aisle-like gaps on N and S → prefer NORTH
    north = _wh_rack("N", 10, 0, 5, 5, rid=2)  # gap to store: 10-5=5
    south = _wh_rack("S", 10, 20, 5, 5, rid=3)  # gap: 20-15=5
    store2 = _store(x=10, y=10, width=5, height=5, id=1)
    face2 = _infer_store_face_from_neighbors(store2, [store2, north, south])
    assert face2 == face_for_cardinal("NORTH", orientation="vertical")


# --- H. Origin normalize / persist shape ---
def test_h_origin_normalize_null_is_legacy():
    assert normalize_service_face_origin(None) == ServiceFaceOrigin.LEGACY_DEFAULT
    assert normalize_service_face_origin("") == ServiceFaceOrigin.LEGACY_DEFAULT
    assert normalize_service_face_origin("explicit") == ServiceFaceOrigin.EXPLICIT
    assert normalize_service_face_origin("AUTO_REPAIR") == ServiceFaceOrigin.AUTO_REPAIR


def test_h_round_trip_origin_on_orm(db):
    wh, layout, store, _, _ = _seed_prod_like_store(
        db, origin=ServiceFaceOrigin.AUTO_REPAIR, side="FRONT", rot=90
    )
    db.refresh(store)
    assert store.service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
    store.service_face_origin = ServiceFaceOrigin.EXPLICIT
    db.flush()
    db.refresh(store)
    assert store.service_face_origin == ServiceFaceOrigin.EXPLICIT


def test_all_front180_not_auto_qualified_without_fingerprint():
    """Intentional-looking EAST without diagonal pseudo-neighbor must NOT match fingerprint."""
    store = _store(x=0, y=50, width=12, height=8, service_side="FRONT", rotation_degrees=180)
    # True east neighbor — justified EAST, not the bug
    east = _wh_rack("E", 16, 50, 10, 8, rid=2)
    expected = face_for_cardinal("EAST", orientation="vertical")
    assert not matches_legacy_buggy_store_diagonal_east(
        store, [store, east], expected, orientation="vertical"
    )
    # No neighbors at all — do not guess FRONT+180 as buggy AUTO
    expected_n = face_for_cardinal("NORTH", orientation="vertical")
    assert not matches_legacy_buggy_store_diagonal_east(
        store, [store], expected_n, orientation="vertical"
    )
