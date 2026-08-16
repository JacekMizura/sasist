"""ESP:carrier + legacy carrier scan SSOT tests."""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.app_user import AppUser
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.models.warehouse_carrier import WarehouseCarrier
from backend.services.esp_scan_codes import carrier_scan_code, parse_esp_scan
from backend.services.scan_service import parse_barcode_type, resolve_barcode
from backend.services.wms_carrier_service import carrier_to_read, find_carrier_by_scan_code, scan_carrier_by_barcode


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (Warehouse, Location, TenantWarehouse, AppUser, WarehouseCarrier, Inventory):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Warehouse(id=1, tenant_id=1, name="WH-1", requires_putaway=True))
    session.add(TenantWarehouse(tenant_id=1, warehouse_id=1))
    session.add(Location(id=10, warehouse_id=1, name="DOCK-IN", type="floor", location_type="DOCK"))
    session.add(
        AppUser(
            id=1,
            login="jan",
            email="jan@test.local",
            password_hash="x",
            first_name="Jan",
            last_name="Kowalski",
            is_active=True,
        )
    )
    session.commit()
    yield session
    session.close()


def _carrier(db, *, code: str, barcode: str, carrier_id: int | None = None) -> WarehouseCarrier:
    kwargs = dict(
        tenant_id=1,
        code=code,
        barcode=barcode,
        status="ACTIVE",
        is_mixed=False,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    if carrier_id is not None:
        kwargs["id"] = int(carrier_id)
    c = WarehouseCarrier(**kwargs)
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_a_carrier_scan_code_helper():
    assert carrier_scan_code(6) == "ESP:carrier:6"


def test_b_parse_esp_carrier():
    assert parse_esp_scan("ESP:carrier:6") == ("carrier", 6)
    assert parse_esp_scan("esp:CARRIER:12") == ("carrier", 12)


def test_c_find_by_esp(db):
    c = _carrier(db, code="PAL-000006", barcode="PAL-000006", carrier_id=6)
    hit = find_carrier_by_scan_code(db, 1, "ESP:carrier:6")
    assert hit is not None
    assert int(hit.id) == int(c.id)


def test_d_legacy_pal_still_works(db):
    c = _carrier(db, code="PAL-000006", barcode="PAL-000006", carrier_id=6)
    hit = find_carrier_by_scan_code(db, 1, "PAL-000006")
    assert hit is not None
    assert int(hit.id) == int(c.id)
    out = scan_carrier_by_barcode(db, 1, "pal-000006")
    assert out.found is True
    assert out.carrier is not None
    assert out.carrier.scan_code == "ESP:carrier:6"


def test_e_f_custom_code_5431_typed_qr_is_carrier(db):
    c = _carrier(db, code="5431", barcode="PAL-99", carrier_id=99)
    assert parse_barcode_type("5431") is None or parse_barcode_type("5431") != "carrier"
    assert parse_barcode_type("ESP:carrier:99") == "carrier"
    hit = find_carrier_by_scan_code(db, 1, "ESP:carrier:99")
    assert hit is not None and int(hit.id) == int(c.id)
    # Legacy code still resolves when scanned as plain 5431
    assert find_carrier_by_scan_code(db, 1, "5431") is not None


def test_g_api_read_scan_code_computed(db):
    c = _carrier(db, code="PAL-1", barcode="PAL-1", carrier_id=7)
    read = carrier_to_read(db, c)
    assert read.scan_code == "ESP:carrier:7"
    assert read.barcode == "PAL-1"
    assert read.code == "PAL-1"


def test_central_resolve_barcode_esp_and_legacy(db):
    c = _carrier(db, code="BOX-12", barcode="BOX-12", carrier_id=12)
    esp = resolve_barcode(db, "ESP:carrier:12")
    assert esp["type"] == "carrier"
    assert esp["id"] == int(c.id)
    assert esp["additional_data"]["scan_code"] == "ESP:carrier:12"
    leg = resolve_barcode(db, "BOX-12")
    assert leg["type"] == "carrier"
    assert leg["id"] == int(c.id)


def test_esp_wrong_tenant_ignored(db):
    _carrier(db, code="PAL-1", barcode="PAL-1", carrier_id=3)
    assert find_carrier_by_scan_code(db, 2, "ESP:carrier:3") is None
