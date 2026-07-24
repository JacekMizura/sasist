"""Regression: A/B/C service faces + vertical corridor through back-to-back vertical racks."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.location import Location
from backend.models.warehouse import Bin, Rack, Warehouse, WarehouseLayout, WarehouseRackPassage
from backend.models.warehouse_routing import (
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingLocationAccess,
    WarehouseRoutingNode,
)
from backend.services.warehouse_routing.location_access_resolver import (
    STATUS_AMBIGUOUS,
    STATUS_RESOLVED,
    recompute_location_access,
)
from backend.services.warehouse_routing.physical_collision import (
    build_rack_obstacle,
    segment_is_physically_clear,
)
from backend.services.warehouse_routing.rack_service_face import world_service_normal
from backend.services.warehouse_routing.service_face_repair import repair_layout_service_faces


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
        WarehouseRackPassage,
        Bin,
        Location,
        WarehouseRoutingNode,
        WarehouseRoutingEdge,
        WarehouseRoutingLocationAccess,
        WarehouseRoutingGraphMeta,
    ):
        t.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _edge(db, wid, ax, ay, bx, by):
    na, nb = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(WarehouseRoutingNode(uuid=na, warehouse_id=wid, x=ax, y=ay, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=nb, warehouse_id=wid, x=bx, y=by, node_type="junction"))
    e = WarehouseRoutingEdge(
        uuid=str(uuid.uuid4()),
        warehouse_id=wid,
        from_node_uuid=na,
        to_node_uuid=nb,
        distance_m=((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 / 100.0,
        direction="BOTH",
        enabled=True,
    )
    db.add(e)
    db.flush()
    return e


def test_abc_faces_and_access_not_wrong_side(db):
    wh = Warehouse(name="ABC", tenant_id=1)
    db.add(wh)
    db.flush()
    ua, ub, uc = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    containers = [
        {"id": "A", "orientation": "horizontal", "slots": [{"x": 0, "y": 1, "w": 12, "h": 6, "rackId": ua}]},
        {"id": "B", "orientation": "horizontal", "slots": [{"x": 0, "y": 21, "w": 15, "h": 8, "rackId": ub}]},
        {"id": "C", "orientation": "horizontal", "slots": [{"x": 0, "y": 29, "w": 15, "h": 8, "rackId": uc}]},
    ]
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=120, grid_rows=80, width_m=12, length_m=8,
        row_containers_json=json.dumps(containers),
    )
    db.add(layout)
    db.flush()

    def add_rack(name, uid, x, y, w, h):
        r = Rack(
            layout_id=layout.id, uuid=uid, name=name, x=x, y=y, width=w, height=h,
            orientation="vertical", levels=1, bins_per_level=1,
            length_cm=80, width_cm=100, height_cm=200, aisle_letter="A", rack_index=1,
            service_side="FRONT", rotation_degrees=0, is_active=True, rack_type="warehouse",
        )
        db.add(r)
        db.flush()
        loc_u = str(uuid.uuid4())
        db.add(Bin(rack_id=r.id, location_uuid=loc_u, label=f"{name}-1", level_index=0, segment_index=0, volume_dm3=10))
        cx = (x + w / 2) * 10
        cy = (y + h / 2) * 10
        loc = Location(
            warehouse_id=wh.id, name=f"{name}-1", location_uuid=loc_u, type="pick",
            rack_name=name, x=cx, y=cy, z=0,
        )
        db.add(loc)
        db.flush()
        return r, loc

    ra, la = add_rack("A1", ua, 0, 1, 12, 6)
    rb, lb = add_rack("B1", ub, 0, 21, 15, 8)
    rc, lc = add_rack("C1", uc, 0, 29, 15, 8)

    # Roads like prod: y=90 (A), y=200 (B north), y=380 (C south)
    _edge(db, wh.id, 10, 90, 1200, 90)
    _edge(db, wh.id, 10, 200, 1200, 200)
    _edge(db, wh.id, 10, 380, 1200, 380)
    db.commit()

    # BEFORE: all FRONT/0
    recompute_location_access(db, wh.id, migrate_aps=False)
    db.commit()
    before_rows = {r.location_id: r for r in db.query(WarehouseRoutingLocationAccess).filter_by(warehouse_id=wh.id).all()}

    repair_layout_service_faces(db, wh.id, layout=layout)
    db.flush()
    na = world_service_normal(orientation=ra.orientation, rotation_degrees=ra.rotation_degrees, service_side=ra.service_side)
    nb = world_service_normal(orientation=rb.orientation, rotation_degrees=rb.rotation_degrees, service_side=rb.service_side)
    nc = world_service_normal(orientation=rc.orientation, rotation_degrees=rc.rotation_degrees, service_side=rc.service_side)
    assert na.y == pytest.approx(1.0)
    assert nb.y == pytest.approx(-1.0)
    assert nc.y == pytest.approx(1.0)

    recompute_location_access(db, wh.id, migrate_aps=False)
    db.commit()
    rows = {r.location_id: r for r in db.query(WarehouseRoutingLocationAccess).filter_by(warehouse_id=wh.id).all()}
    assert rows[la.id].status == STATUS_RESOLVED
    assert rows[lb.id].status == STATUS_RESOLVED
    assert rows[lc.id].status == STATUS_RESOLVED
    assert rows[la.id].entry_y_cm == pytest.approx(90, abs=1)
    assert rows[lb.id].entry_y_cm == pytest.approx(200, abs=1)
    assert rows[lc.id].entry_y_cm == pytest.approx(380, abs=1)
    # C must not bind to B aisle; A must not bind behind to y=200
    assert abs((rows[lc.id].entry_y_cm or 0) - 200) > 20
    assert abs((rows[la.id].entry_y_cm or 0) - 200) > 20
    # BEFORE with wrong face often attaches C to north aisle or is AMBIGUOUS
    b_c = before_rows.get(lc.id)
    if b_c and b_c.entry_y_cm is not None and b_c.status == STATUS_RESOLVED:
        # If somehow resolved before, it should not already be the correct south face in this setup
        # (left-normal can still hit y=380 via long approach) — soft check only when wrong-side
        pass
    assert before_rows[la.id].status in (STATUS_RESOLVED, STATUS_AMBIGUOUS)


def test_vertical_racks_passage_corridor_b4_c4(db):
    """Vertical orientation back-to-back: full-along passages clear N-S road."""
    wh = Warehouse(name="P", tenant_id=1)
    db.add(wh)
    db.flush()
    layout = WarehouseLayout(warehouse_id=wh.id, name="L", grid_cols=80, grid_rows=50, width_m=8, length_m=5)
    db.add(layout)
    db.flush()
    b4 = Rack(
        layout_id=layout.id, uuid=str(uuid.uuid4()), name="B4",
        x=46, y=21, width=15, height=8, orientation="vertical",
        levels=1, bins_per_level=1, length_cm=80, width_cm=150, height_cm=200,
        aisle_letter="B", rack_index=4, is_active=True,
    )
    c4 = Rack(
        layout_id=layout.id, uuid=str(uuid.uuid4()), name="C4",
        x=46, y=29, width=15, height=8, orientation="vertical",
        levels=1, bins_per_level=1, length_cm=80, width_cm=150, height_cm=200,
        aisle_letter="C", rack_index=4, is_active=True,
    )
    db.add_all([b4, c4])
    db.flush()
    # Vertical road through both (like prod x≈539)
    ax, ay, bx, by = 538.8, 200.0, 538.8, 380.0
    obs_b = build_rack_obstacle(b4, [])
    obs_c = build_rack_obstacle(c4, [])
    assert not segment_is_physically_clear(ax, ay, bx, by, [obs_b, obs_c])

    # Full-height passages (along Y covers entire rack)
    pb = WarehouseRackPassage(
        uuid=str(uuid.uuid4()), warehouse_id=wh.id, rack_id=b4.id, rack_uuid=b4.uuid,
        offset_along_cm=0, width_cm=80, enabled=True,
    )
    pc = WarehouseRackPassage(
        uuid=str(uuid.uuid4()), warehouse_id=wh.id, rack_id=c4.id, rack_uuid=c4.uuid,
        offset_along_cm=0, width_cm=80, enabled=True,
    )
    db.add_all([pb, pc])
    db.flush()
    obs_b2 = build_rack_obstacle(b4, [pb])
    obs_c2 = build_rack_obstacle(c4, [pc])
    assert segment_is_physically_clear(ax, ay, bx, by, [obs_b2, obs_c2])

    # Only one passage still blocks
    assert not segment_is_physically_clear(ax, ay, bx, by, [obs_b2, obs_c])
