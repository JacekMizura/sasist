"""Carrier label template_type + record bindings."""

from __future__ import annotations

import json
from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.domain.label_templates import LABEL_TEMPLATE_TYPE_CARRIER
from backend.models.label_template import SavedLabelTemplate
from backend.models.warehouse_carrier import WarehouseCarrier
from backend.services.esp_scan_codes import carrier_scan_code
from backend.services.label_pack_service import _carrier_record
from backend.services.label_template_serializer import apply_import, parse_import_payload


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    WarehouseCarrier.__table__.create(engine, checkfirst=True)
    SavedLabelTemplate.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_h_template_type_carrier_save_export_import(db):
    tpl = {
        "widthMm": 100,
        "heightMm": 50,
        "dpi": 300,
        "elements": [
            {
                "id": "t1",
                "type": "dynamicText",
                "x": 1,
                "y": 1,
                "width": 30,
                "height": 10,
                "binding": "{carrier_code}",
                "fontSize": 12,
            },
            {
                "id": "q1",
                "type": "barcode",
                "x": 40,
                "y": 5,
                "width": 28,
                "height": 28,
                "format": "QR",
                "dataBinding": "barcode_data",
            },
        ],
    }
    row = SavedLabelTemplate(
        tenant_id=1,
        name="Etykieta nośnika — pozioma",
        template_type=LABEL_TEMPLATE_TYPE_CARRIER,
        template_json=json.dumps(tpl),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.commit()

    payload = {
        "schema_version": 1,
        "kind": "wms_label_templates",
        "templates": [
            {
                "name": "Etykieta nośnika — pozioma (import)",
                "template_type": "carrier",
                "template_json": tpl,
            }
        ],
    }
    items, errors = parse_import_payload(payload)
    assert not errors
    assert items[0]["template_type"] == "carrier"
    result = apply_import(db, 1, items, mode="create_new")
    db.commit()
    assert result.get("created", 0) >= 1
    rows = db.query(SavedLabelTemplate).filter(SavedLabelTemplate.template_type == "carrier").all()
    assert len(rows) >= 2


def test_i_j_carrier_record_bindings(db):
    c = WarehouseCarrier(
        id=6,
        tenant_id=1,
        code="PAL-000006",
        barcode="PAL-000006",
        name="Nośnik 6",
        status="ACTIVE",
        is_mixed=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(c)
    db.commit()
    rec = _carrier_record(c)
    assert rec["carrier_code"] == "PAL-000006"
    assert rec["carrier_barcode"] == "PAL-000006"
    assert rec["carrier_scan_code"] == "ESP:carrier:6"
    assert rec["barcode_data"] == "ESP:carrier:6"
    assert rec["barcode_data"] == carrier_scan_code(6)
    assert rec["{carrier_code}"] == "PAL-000006"
