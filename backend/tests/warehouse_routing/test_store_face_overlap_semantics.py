"""Store service-face inference: real transverse overlap only (no diagonal slack)."""

from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.warehouse import Rack, Warehouse, WarehouseLayout
from backend.services.warehouse_routing.rack_service_face import (
    ServiceFace,
    face_for_cardinal,
    world_service_normal,
)
from backend.services.warehouse_routing.service_face_repair import (
    _infer_store_face_from_neighbors,
    _store_neighbor_gap_candidates,
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
    )
    base.update(kwargs)
    return _ns(**base)


def _wh_rack(name, x, y, w, h, rid=2):
    return _ns(
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
    )


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


def test_prod_like_s1_rejects_diagonal_east_picks_north():
    """
    REAL PROD WH1 geometry (cells):
      S1 store @ (0,50) 12×8
      C1 @ (1,29) 15×8  — true NORTH (X-overlap, gap 13)
      C2 @ (16,29) 15×8 — diagonal; old lateral_slack falsely made EAST gap=4
    Old: EAST. New: NORTH / FRONT+90.
    """
    s1 = _store(x=0, y=50, width=12, height=8, name="S1")
    c1 = _wh_rack("C1", 1, 29, 15, 8, rid=2)
    c2 = _wh_rack("C2", 16, 29, 15, 8, rid=3)
    others = [s1, c1, c2]

    cands = _store_neighbor_gap_candidates(s1, others)
    assert ("EAST",) not in [(d,) for _g, d in cands] or all(d != "EAST" for _g, d in cands)
    assert any(d == "NORTH" and abs(g - 13.0) < 1e-6 for g, d in cands)
    assert not any(d == "EAST" for _g, d in cands)

    face = _infer_store_face_from_neighbors(s1, others)
    expected = face_for_cardinal("NORTH", orientation="vertical")
    assert face == expected
    n = world_service_normal(
        orientation="vertical",
        service_side=face.service_side,
        rotation_degrees=face.rotation_degrees,
    )
    assert abs(n.x) < 1e-6 and n.y < -0.5


def test_a_true_east_neighbor_with_y_overlap_affects_east():
    store = _store(x=0, y=50, width=12, height=8)
    east = _wh_rack("E", 16, 50, 10, 8, rid=2)  # same Y band — real Y-overlap, gap=4
    cands = _store_neighbor_gap_candidates(store, [store, east])
    assert any(d == "EAST" and abs(g - 4.0) < 1e-6 for g, d in cands)
    face = _infer_store_face_from_neighbors(store, [store, east])
    assert face == face_for_cardinal("EAST", orientation="vertical")


def test_b_diagonal_east_without_y_overlap_ignored():
    store = _store(x=0, y=50, width=12, height=8)
    diag = _wh_rack("D", 16, 29, 15, 8, rid=2)  # PROD C2-like
    cands = _store_neighbor_gap_candidates(store, [store, diag])
    assert not any(d == "EAST" for _g, d in cands)
    # Open-space may still infer a face; must not invent EAST from diagonal neighbor gap.
    # With only diagonal obstacle north-east, open clearance NORTH may be large/0 depending
    # on ray — face must not be EAST via neighbor list.
    face = _infer_store_face_from_neighbors(store, [store, diag])
    if face is not None:
        assert face != face_for_cardinal("EAST", orientation="vertical")


def test_c_true_north_neighbor_with_x_overlap():
    store = _store(x=0, y=50, width=12, height=8)
    north = _wh_rack("N", 1, 29, 15, 8, rid=2)
    cands = _store_neighbor_gap_candidates(store, [store, north])
    assert any(d == "NORTH" and abs(g - 13.0) < 1e-6 for g, d in cands)
    face = _infer_store_face_from_neighbors(store, [store, north])
    assert face == face_for_cardinal("NORTH", orientation="vertical")


def test_d_epsilon_touching_boundary_stable():
    """Footprints that barely touch on transverse axis still count as real overlap."""
    store = _store(x=0, y=50, width=12, height=8)
    # Touch on X: neighbor max_x == store min_x → overlap length 0 (endpoint touch)
    north = _wh_rack("N", -10, 29, 10, 8, rid=2)  # bx1=0 == ax0
    cands = _store_neighbor_gap_candidates(store, [store, north])
    assert any(d == "NORTH" for _g, d in cands)


def test_e_no_neighbors_deterministic_no_diagonal_guess():
    store = _store(x=10, y=10, width=5, height=5)
    far = _wh_rack("FAR", 80, 80, 5, 5, rid=2)  # diagonal far — no overlap either axis as neighbor gap
    cands = _store_neighbor_gap_candidates(store, [store, far])
    assert cands == []
    face = _infer_store_face_from_neighbors(store, [store, far])
    # Open-space fallback: sealed walls (c≈0) or None — must not pick a face from diagonal gap list
    if face is not None:
        # Only open clearance along midpoints; far rack does not block mid-face rays typically
        assert isinstance(face, ServiceFace)


def test_self_heal_unjustified_front180_east_to_north(db):
    """PROD state after buggy repair: FRONT+180 EAST must self-heal to NORTH when C1 present."""
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
        is_active=True,
    )
    s1 = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
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
        rotation_degrees=180,  # buggy prior repair (EAST)
        is_active=True,
    )
    db.add_all([c1, c2, s1])
    db.flush()

    expected = face_for_cardinal("NORTH", orientation="vertical")
    assert should_repair_store_face(s1, expected, [c1, c2, s1], orientation="vertical") is True

    # Justified explicit NORTH must NOT be overwritten toward something else if already matching
    s1.rotation_degrees = 90
    assert should_repair_store_face(s1, expected, [c1, c2, s1], orientation="vertical") is False

    # Reset buggy state and run full repair
    s1.service_side = "FRONT"
    s1.rotation_degrees = 180
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(s1)
    assert int(s1.rotation_degrees or 0) == 90
    assert str(s1.service_side).upper() == "FRONT"
    assert any(
        r.get("name") == "S1" and "self_heal" in str(r.get("reason", "")) for r in report.repaired
    )


def test_justified_explicit_east_preserved(db):
    """True EAST neighbor: FRONT+180 is geometrically justified → do not overwrite to NORTH."""
    wh = Warehouse(name="W2", tenant_id=1)
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
        rotation_degrees=180,  # EAST — justified by real Y-overlap neighbor
        is_active=True,
    )
    db.add_all([east, store])
    db.flush()
    report = repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    db.refresh(store)
    # Expected inference is EAST (gap 4); already matches → no change
    assert int(store.rotation_degrees or 0) == 180
    assert not any(r.get("name") == "ST" and r.get("changed") for r in report.repaired)
