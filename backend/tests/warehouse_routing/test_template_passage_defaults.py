"""Template default_passages + passage_source INHERITED/LOCAL persistence."""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.passage_source import PassageSource, normalize_passage_source
from backend.models.warehouse import Rack, Warehouse, WarehouseLayout, WarehouseRackPassage
from backend.models.warehouse_template import WarehouseTemplate
from backend.services.warehouse_layout_service import WarehouseLayoutService
from backend.services.warehouse_template_service import WarehouseTemplateService


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    Warehouse.__table__.create(engine, checkfirst=True)
    WarehouseLayout.__table__.create(engine, checkfirst=True)
    Rack.__table__.create(engine, checkfirst=True)
    WarehouseRackPassage.__table__.create(engine, checkfirst=True)
    WarehouseTemplate.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_normalize_passage_source_defaults_to_local():
    assert normalize_passage_source(None) == PassageSource.LOCAL
    assert normalize_passage_source("") == PassageSource.LOCAL
    assert normalize_passage_source("bogus") == PassageSource.LOCAL
    assert normalize_passage_source("INHERITED") == PassageSource.INHERITED
    assert normalize_passage_source("inherited") == PassageSource.INHERITED


def test_template_default_passages_round_trip(db):
    svc = WarehouseTemplateService(db)
    created = svc.create(
        1,
        {
            "id": "tpl-pass-1",
            "name": "Z przejazdami",
            "default_passages": [
                {"offset_along_cm": 40, "width_cm": 90, "enabled": True},
                {"offset_along_cm": 200, "width_cm": 80, "clearance_height_cm": 220},
            ],
        },
    )
    assert created["default_passages"] is not None
    assert len(created["default_passages"]) == 2
    assert created["default_passages"][0]["offset_along_cm"] == 40
    assert created["default_passages"][0]["width_cm"] == 90
    assert created["default_passages"][1]["clearance_height_cm"] == 220

    listed = svc.get_all(1)
    row = next(t for t in listed if t["id"] == "tpl-pass-1")
    assert len(row["default_passages"]) == 2

    updated = svc.create(
        1,
        {
            "id": "tpl-pass-1",
            "name": "Z przejazdami",
            "default_passages": [{"offset_along_cm": 10, "width_cm": 50}],
        },
    )
    assert len(updated["default_passages"]) == 1
    assert updated["default_passages"][0]["width_cm"] == 50

    cleared = svc.create(
        1,
        {
            "id": "tpl-pass-1",
            "name": "Z przejazdami",
            "default_passages": [],
        },
    )
    assert cleared["default_passages"] is None


def test_layout_sync_persists_passage_source_local_by_default(db):
    wh = Warehouse(name=f"W-{uuid.uuid4().hex[:6]}", tenant_id=1)
    db.add(wh)
    db.flush()
    layout = WarehouseLayout(
        warehouse_id=wh.id,
        name="L",
        grid_cols=40,
        grid_rows=40,
        width_m=4,
        length_m=4,
    )
    db.add(layout)
    db.flush()
    rack = Rack(
        layout_id=layout.id,
        uuid=str(uuid.uuid4()),
        name="R1",
        x=0,
        y=0,
        width=12,
        height=8,
        orientation="horizontal",
        levels=1,
        bins_per_level=1,
        length_cm=80,
        width_cm=120,
        height_cm=200,
        aisle_letter="A",
        rack_index=1,
    )
    db.add(rack)
    db.commit()
    db.refresh(rack)

    svc = WarehouseLayoutService(db)
    svc._sync_rack_passages(
        rack,
        wh.id,
        [
            {
                "uuid": "p-legacy",
                "offset_along_cm": 20,
                "width_cm": 40,
                "enabled": True,
            },
            {
                "uuid": "p-inh",
                "offset_along_cm": 70,
                "width_cm": 30,
                "enabled": True,
                "passage_source": "INHERITED",
            },
        ],
    )
    db.commit()
    db.refresh(rack)

    rows = {
        p.uuid: p
        for p in db.query(WarehouseRackPassage).filter(WarehouseRackPassage.rack_id == rack.id).all()
    }
    assert rows["p-legacy"].passage_source == PassageSource.LOCAL.value
    assert rows["p-inh"].passage_source == PassageSource.INHERITED.value

    serialized = {p["uuid"]: p for p in svc._serialize_rack_passages(rack)}
    assert serialized["p-legacy"]["passage_source"] == "LOCAL"
    assert serialized["p-inh"]["passage_source"] == "INHERITED"
