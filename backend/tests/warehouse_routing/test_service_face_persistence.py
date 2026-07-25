"""Service-face persistence on save_layout + Location Access lifecycle."""

from __future__ import annotations

import json
import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.location import Location
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.service_face_origin import ServiceFaceOrigin
from backend.models.warehouse import (
    Aisle,
    Bin,
    Rack,
    StorageLocation,
    Warehouse,
    WarehouseLayout,
    WarehouseRackPassage,
)
from backend.models.warehouse_routing import (
    WarehouseRoutingEdge,
    WarehouseRoutingGraphMeta,
    WarehouseRoutingLocationAccess,
    WarehouseRoutingNode,
)
from backend.services.warehouse_layout_service import WarehouseLayoutService
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
        TenantWarehouse,
        WarehouseLayout,
        Rack,
        WarehouseRackPassage,
        Bin,
        Location,
        Aisle,
        StorageLocation,
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


@pytest.fixture()
def quiet_save(monkeypatch):
    """Skip product/slotting cleanup that needs extra tables unrelated to face SSOT."""
    monkeypatch.setattr(
        WarehouseLayoutService,
        "_cleanup_product_assigned_locations_after_layout_save",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.product_warehouse_slotting_service.cleanup_slotting_after_layout_save",
        lambda *a, **k: 0,
    )


def _abc_payload():
    a_u, b_u, c_u = str(uuid.uuid4()), str(uuid.uuid4()), str(uuid.uuid4())
    containers = [
        {
            "id": "row-A",
            "rowPrefix": "A",
            "orientation": "horizontal",
            "slots": [{"x": 0, "y": 1, "w": 12, "h": 6, "rackId": a_u}],
        },
        {
            "id": "row-B",
            "rowPrefix": "B",
            "orientation": "horizontal",
            "slots": [{"x": 1, "y": 21, "w": 15, "h": 8, "rackId": b_u}],
        },
        {
            "id": "row-C",
            "rowPrefix": "C",
            "orientation": "horizontal",
            "slots": [{"x": 1, "y": 29, "w": 15, "h": 8, "rackId": c_u}],
        },
    ]

    def rack(name, uid, x, y, w, h, side="FRONT", rot=0):
        return {
            "uuid": uid,
            "name": name,
            "x": x,
            "y": y,
            "width": w,
            "height": h,
            "orientation": "vertical",
            "levels": 1,
            "bins_per_level": 1,
            "length_cm": 80,
            "width_cm": 100,
            "height_cm": 200,
            "aisle_letter": name[0],
            "rack_index": 1,
            "rack_type": "warehouse",
            "service_side": side,
            "rotation_degrees": rot,
            "bins": [
                {
                    "uuid": str(uuid.uuid4()),
                    "location_uuid": str(uuid.uuid4()),
                    "label": f"{name}-1",
                    "level_index": 0,
                    "segment_index": 0,
                    "volume_dm3": 10,
                    "storage_type": "pick",
                }
            ],
        }

    payload = {
        "name": "L1",
        "grid_cols": 120,
        "grid_rows": 80,
        "row_containers": containers,
        "racks": [
            rack("A1", a_u, 0, 1, 12, 6),
            rack("B1", b_u, 1, 21, 15, 8),
            rack("C1", c_u, 1, 29, 15, 8),
        ],
        "aisles": [],
        "visual_elements": [],
    }
    return payload, a_u, b_u, c_u


def test_rotation_degrees_roundtrip_values():
    from backend.services.warehouse_routing.rack_service_face import normalize_rotation

    for r in (0, 90, 180, 270):
        assert normalize_rotation(r) == r
    assert normalize_rotation(270) != 0


def _seed_wh(db):
    wh = Warehouse(id=1, name="WH1", tenant_id=1)
    db.add(wh)
    db.flush()
    db.add(
        WarehouseLayout(
            warehouse_id=1,
            name="seed",
            grid_cols=120,
            grid_rows=80,
            row_containers_json=json.dumps([]),
        )
    )
    n1, n2 = str(uuid.uuid4()), str(uuid.uuid4())
    db.add(WarehouseRoutingNode(uuid=n1, warehouse_id=1, x=50, y=90, node_type="junction"))
    db.add(WarehouseRoutingNode(uuid=n2, warehouse_id=1, x=50, y=200, node_type="junction"))
    db.add(
        WarehouseRoutingEdge(
            uuid=str(uuid.uuid4()),
            warehouse_id=1,
            from_node_uuid=n1,
            to_node_uuid=n2,
            distance_m=1.0,
            direction="BOTH",
            enabled=True,
        )
    )
    db.add(WarehouseRoutingGraphMeta(warehouse_id=1, revision=1))
    db.commit()


def test_save_layout_persists_repair_across_new_session(db, quiet_save):
    """Repair must be in DB after save_layout — visible in a fresh session."""
    payload, a_u, b_u, c_u = _abc_payload()
    _seed_wh(db)

    WarehouseLayoutService(db).save_layout(1, 1, payload)

    bind = db.get_bind()
    db2 = sessionmaker(bind=bind)()
    try:
        racks = {r.name: r for r in db2.query(Rack).all()}
        na = world_service_normal(
            orientation=racks["A1"].orientation,
            rotation_degrees=racks["A1"].rotation_degrees,
            service_side=racks["A1"].service_side,
        )
        nb = world_service_normal(
            orientation=racks["B1"].orientation,
            rotation_degrees=racks["B1"].rotation_degrees,
            service_side=racks["B1"].service_side,
        )
        nc = world_service_normal(
            orientation=racks["C1"].orientation,
            rotation_degrees=racks["C1"].rotation_degrees,
            service_side=racks["C1"].service_side,
        )
        assert na.y == pytest.approx(1.0)
        assert nb.y == pytest.approx(-1.0)
        assert nc.y == pytest.approx(1.0)
        assert int(racks["A1"].rotation_degrees or 0) == 270
        assert int(racks["B1"].rotation_degrees or 0) == 90
        assert int(racks["C1"].rotation_degrees or 0) == 270
        # Conscious repair → AUTO_REPAIR provenance
        assert racks["A1"].service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
        assert racks["B1"].service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
        assert racks["C1"].service_face_origin == ServiceFaceOrigin.AUTO_REPAIR

        # Second save with repaired faces — idempotent, no regress to FRONT+0
        layout2 = db2.query(WarehouseLayout).filter(WarehouseLayout.warehouse_id == 1).one()
        payload2 = dict(payload)
        payload2["row_containers"] = json.loads(layout2.row_containers_json or "[]")
        payload2["racks"] = []
        for name, u, x, y, w, h in (
            ("A1", a_u, 0, 1, 12, 6),
            ("B1", b_u, 1, 21, 15, 8),
            ("C1", c_u, 1, 29, 15, 8),
        ):
            r = racks[name]
            payload2["racks"].append(
                {
                    "uuid": u,
                    "name": name,
                    "x": x,
                    "y": y,
                    "width": w,
                    "height": h,
                    "orientation": "vertical",
                    "levels": 1,
                    "bins_per_level": 1,
                    "length_cm": 80,
                    "width_cm": 100,
                    "height_cm": 200,
                    "aisle_letter": name[0],
                    "rack_index": 1,
                    "rack_type": "warehouse",
                    "service_side": r.service_side,
                    "rotation_degrees": int(r.rotation_degrees or 0),
                    "service_face_origin": r.service_face_origin,
                    "bins": [
                        {
                            "uuid": str(uuid.uuid4()),
                            "location_uuid": str(uuid.uuid4()),
                            "label": f"{name}-1",
                            "level_index": 0,
                            "segment_index": 0,
                            "volume_dm3": 10,
                            "storage_type": "pick",
                        }
                    ],
                }
            )
        WarehouseLayoutService(db2).save_layout(1, 1, payload2)
        db2.expire_all()
        racks_b = {r.name: r for r in db2.query(Rack).all()}
        assert int(racks_b["A1"].rotation_degrees or 0) == 270
        assert racks_b["A1"].service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
        assert racks_b["B1"].service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
        assert racks_b["C1"].service_face_origin == ServiceFaceOrigin.AUTO_REPAIR
        assert int(racks_b["B1"].rotation_degrees or 0) == 90
        assert int(racks_b["C1"].rotation_degrees or 0) == 270
        report = repair_layout_service_faces(db2, 1, layout=layout2)
        assert report.deterministic_count == 0
    finally:
        db2.close()


def test_repair_committed_before_recompute_uses_new_faces(db, quiet_save, monkeypatch):
    """Resolver during recompute must see repaired faces (not stale FRONT+0)."""
    import backend.services.warehouse_routing.location_access_resolver as lar

    payload, _, _, _ = _abc_payload()
    _seed_wh(db)

    seen: list[tuple[str, int]] = []
    real = lar.recompute_location_access

    def _spy_recompute(db_sess, warehouse_id, migrate_aps=True):
        for r in db_sess.query(Rack).all():
            if r.name in ("A1", "B1", "C1"):
                seen.append((r.name, int(r.rotation_degrees or 0)))
        return real(db_sess, warehouse_id, migrate_aps=migrate_aps)

    monkeypatch.setattr(lar, "recompute_location_access", _spy_recompute)
    WarehouseLayoutService(db).save_layout(1, 1, payload)
    by_name = {n: rot for n, rot in seen}
    assert by_name.get("A1") == 270
    assert by_name.get("B1") == 90
    assert by_name.get("C1") == 270


def test_legal_front0_west_not_overwritten_on_save(db, quiet_save):
    west_u, east_u = str(uuid.uuid4()), str(uuid.uuid4())
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
    wh = Warehouse(id=1, name="W", tenant_id=1)
    db.add(wh)
    db.flush()
    db.add(
        WarehouseLayout(
            warehouse_id=1,
            name="L",
            grid_cols=40,
            grid_rows=40,
            row_containers_json=json.dumps(containers),
        )
    )
    db.commit()

    def rack_payload(name, uid, x):
        return {
            "uuid": uid,
            "name": name,
            "x": x,
            "y": 0,
            "width": 8,
            "height": 20,
            "orientation": "vertical",
            "levels": 1,
            "bins_per_level": 1,
            "length_cm": 80,
            "width_cm": 100,
            "height_cm": 200,
            "aisle_letter": "W",
            "rack_index": 1,
            "rack_type": "warehouse",
            "service_side": "FRONT",
            "rotation_degrees": 0,
            "bins": [
                {
                    "uuid": str(uuid.uuid4()),
                    "location_uuid": str(uuid.uuid4()),
                    "label": f"{name}-1",
                    "level_index": 0,
                    "segment_index": 0,
                    "volume_dm3": 10,
                    "storage_type": "pick",
                }
            ],
        }

    payload = {
        "name": "L",
        "grid_cols": 40,
        "grid_rows": 40,
        "row_containers": containers,
        "racks": [rack_payload("W1", west_u, 0), rack_payload("E1", east_u, 8)],
        "aisles": [],
        "visual_elements": [],
    }
    WarehouseLayoutService(db).save_layout(1, 1, payload)
    db.expire_all()
    racks = {r.name: r for r in db.query(Rack).all()}
    assert racks["W1"].service_side == "FRONT"
    assert int(racks["W1"].rotation_degrees or 0) == 0
    assert int(racks["E1"].rotation_degrees or 0) == 180
