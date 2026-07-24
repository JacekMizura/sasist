"""
Pre-push audit: corridor persistence round-trip + group collision E2E (in-memory).

Does NOT touch PROD. Validates:
- create B4+C4 corridor via layout sync
- save → serialize → re-save without dupes
- corridor_uuid stable
- collision before/with/after delete
- graph N/E unchanged (no routing nodes created by passages)
"""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.warehouse import Rack, Warehouse, WarehouseLayout, WarehouseRackPassage
from backend.models.warehouse_routing import (
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingNode,
)
from backend.services.warehouse_layout_service import WarehouseLayoutService
from backend.services.warehouse_routing.physical_collision import (
    build_rack_obstacle,
    segment_is_physically_clear,
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
        WarehouseRackPassage,
        WarehouseRoutingNode,
        WarehouseRoutingEdge,
        WarehouseRoutingGraphMeta,
    ):
        t.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def _seed_b4_c4(db):
    wh = Warehouse(name="WH1-copy", tenant_id=1)
    db.add(wh)
    db.flush()
    layout = WarehouseLayout(
        warehouse_id=wh.id, name="L", grid_cols=80, grid_rows=50, width_m=8, length_m=5
    )
    db.add(layout)
    db.flush()
    b4 = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="B4",
        x=46,
        y=21,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=150,
        height_cm=200,
        aisle_letter="B",
        rack_index=4,
        is_active=True,
    )
    c4 = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="C4",
        x=46,
        y=29,
        width=15,
        height=8,
        orientation="vertical",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=150,
        height_cm=200,
        aisle_letter="C",
        rack_index=4,
        is_active=True,
    )
    db.add_all([b4, c4])
    db.flush()
    return wh, layout, b4, c4


def _vertical_edge(db, wid, ax=538.8, ay=200.0, bx=538.8, by=380.0):
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
    return e, (ax, ay, bx, by)


def test_persistence_round_trip_corridor_b4_c4(db):
    wh, layout, b4, c4 = _seed_b4_c4(db)
    corridor = str(uuid.uuid4())
    pu_b, pu_c = str(uuid.uuid4()), str(uuid.uuid4())
    svc = WarehouseLayoutService(db)

    # Create via sync (same path as save_layout)
    svc._sync_rack_passages(
        b4,
        wh.id,
        [
            {
                "uuid": pu_b,
                "offset_along_cm": 0,
                "width_cm": 80,
                "enabled": True,
                "corridor_uuid": corridor,
            }
        ],
    )
    svc._sync_rack_passages(
        c4,
        wh.id,
        [
            {
                "uuid": pu_c,
                "offset_along_cm": 0,
                "width_cm": 80,
                "enabled": True,
                "corridor_uuid": corridor,
            }
        ],
    )
    db.commit()

    # GET serialize
    ser_b = svc._serialize_rack_passages(b4)
    ser_c = svc._serialize_rack_passages(c4)
    assert len(ser_b) == 1 and len(ser_c) == 1
    assert ser_b[0]["uuid"] == pu_b
    assert ser_c[0]["uuid"] == pu_c
    assert ser_b[0]["corridor_uuid"] == corridor
    assert ser_c[0]["corridor_uuid"] == corridor
    assert ser_b[0]["offset_along_cm"] == 0
    assert ser_b[0]["width_cm"] == 80

    # Pydantic round-trip (critical: must not strip)
    from backend.schemas.warehouse_layout import RackSchema, WarehouseLayoutPayload

    payload = WarehouseLayoutPayload(
        name=layout.name,
        grid_cols=layout.grid_cols,
        grid_rows=layout.grid_rows,
        width_m=layout.width_m,
        length_m=layout.length_m,
        racks=[
            RackSchema(
                id=b4.id,
                uuid=b4.uuid,
                name="B4",
                x=b4.x,
                y=b4.y,
                width=b4.width,
                height=b4.height,
                orientation="vertical",
                aisle_letter="B",
                rack_index=4,
                passages=ser_b,
            ),
            RackSchema(
                id=c4.id,
                uuid=c4.uuid,
                name="C4",
                x=c4.x,
                y=c4.y,
                width=c4.width,
                height=c4.height,
                orientation="vertical",
                aisle_letter="C",
                rack_index=4,
                passages=ser_c,
            ),
        ],
    )
    dumped = payload.model_dump()
    assert dumped["racks"][0]["passages"][0]["uuid"] == pu_b
    assert dumped["racks"][1]["passages"][0]["uuid"] == pu_c
    assert dumped["racks"][0]["passages"][0]["corridor_uuid"] == corridor
    assert dumped["racks"][1]["passages"][0]["corridor_uuid"] == corridor

    # Second save without changes (re-sync same payload)
    svc._sync_rack_passages(b4, wh.id, dumped["racks"][0]["passages"])
    svc._sync_rack_passages(c4, wh.id, dumped["racks"][1]["passages"])
    db.commit()

    rows = db.query(WarehouseRackPassage).filter(WarehouseRackPassage.warehouse_id == wh.id).all()
    assert len(rows) == 2
    by_uuid = {r.uuid: r for r in rows}
    assert set(by_uuid) == {pu_b, pu_c}
    assert by_uuid[pu_b].corridor_uuid == corridor
    assert by_uuid[pu_c].corridor_uuid == corridor
    assert by_uuid[pu_b].offset_along_cm == 0
    assert by_uuid[pu_c].width_cm == 80


def test_collision_corridor_lifecycle_graph_stable(db):
    from backend.services.warehouse_routing.physical_collision import (
        edge_uuids_blocked_by_obstacles,
        load_warehouse_rack_obstacles,
    )

    wh, layout, b4, c4 = _seed_b4_c4(db)
    edge, (ax, ay, bx, by) = _vertical_edge(db, wh.id)
    n_before = db.query(WarehouseRoutingNode).filter_by(warehouse_id=wh.id).count()
    e_before = db.query(WarehouseRoutingEdge).filter_by(warehouse_id=wh.id).count()
    nodes = db.query(WarehouseRoutingNode).filter_by(warehouse_id=wh.id).all()
    edges = db.query(WarehouseRoutingEdge).filter_by(warehouse_id=wh.id).all()
    nodes_by_uuid = {n.uuid: n for n in nodes}

    obs_b = build_rack_obstacle(b4, [])
    obs_c = build_rack_obstacle(c4, [])
    assert not segment_is_physically_clear(ax, ay, bx, by, [obs_b, obs_c])

    before_blocked = edge_uuids_blocked_by_obstacles(
        edges, nodes_by_uuid, load_warehouse_rack_obstacles(db, wh.id)
    )
    assert edge.uuid in before_blocked

    corridor = str(uuid.uuid4())
    pb = WarehouseRackPassage(
        uuid=str(uuid.uuid4()),
        warehouse_id=wh.id,
        rack_id=b4.id,
        rack_uuid=b4.uuid,
        offset_along_cm=0,
        width_cm=80,
        enabled=True,
        corridor_uuid=corridor,
    )
    pc = WarehouseRackPassage(
        uuid=str(uuid.uuid4()),
        warehouse_id=wh.id,
        rack_id=c4.id,
        rack_uuid=c4.uuid,
        offset_along_cm=0,
        width_cm=80,
        enabled=True,
        corridor_uuid=corridor,
    )
    db.add_all([pb, pc])
    db.flush()

    assert segment_is_physically_clear(
        ax, ay, bx, by, [build_rack_obstacle(b4, [pb]), build_rack_obstacle(c4, [pc])]
    )

    with_blocked = edge_uuids_blocked_by_obstacles(
        edges, nodes_by_uuid, load_warehouse_rack_obstacles(db, wh.id)
    )
    assert edge.uuid not in with_blocked

    # Passage create must not invent routing geometry
    assert db.query(WarehouseRoutingNode).filter_by(warehouse_id=wh.id).count() == n_before
    assert db.query(WarehouseRoutingEdge).filter_by(warehouse_id=wh.id).count() == e_before

    # Delete corridor
    db.delete(pb)
    db.delete(pc)
    db.flush()
    assert not segment_is_physically_clear(
        ax, ay, bx, by, [build_rack_obstacle(b4, []), build_rack_obstacle(c4, [])]
    )
    after_blocked = edge_uuids_blocked_by_obstacles(
        edges, nodes_by_uuid, load_warehouse_rack_obstacles(db, wh.id)
    )
    assert edge.uuid in after_blocked
    assert db.query(WarehouseRoutingNode).filter_by(warehouse_id=wh.id).count() == n_before
    assert db.query(WarehouseRoutingEdge).filter_by(warehouse_id=wh.id).count() == e_before


def test_null_corridor_uuid_legacy_still_works(db):
    wh, layout, b4, c4 = _seed_b4_c4(db)
    p = WarehouseRackPassage(
        uuid=str(uuid.uuid4()),
        warehouse_id=wh.id,
        rack_id=b4.id,
        rack_uuid=b4.uuid,
        offset_along_cm=10,
        width_cm=40,
        enabled=True,
        corridor_uuid=None,
    )
    db.add(p)
    db.flush()
    obs = build_rack_obstacle(b4, [p])
    assert obs is not None
    svc = WarehouseLayoutService(db)
    ser = svc._serialize_rack_passages(b4)
    assert ser[0]["corridor_uuid"] is None


def test_schema_ensure_idempotent_corridor_column(db):
    from sqlalchemy import inspect

    from backend.db.warehouse_rack_passage_schema import ensure_warehouse_rack_passage_schema

    engine = db.get_bind()
    ensure_warehouse_rack_passage_schema(engine)
    cols1 = {c["name"] for c in inspect(engine).get_columns("warehouse_rack_passages")}
    ensure_warehouse_rack_passage_schema(engine)
    cols2 = {c["name"] for c in inspect(engine).get_columns("warehouse_rack_passages")}
    assert "corridor_uuid" in cols1
    assert cols1 == cols2
