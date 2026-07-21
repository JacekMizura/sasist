"""
Carrier scan SSOT — code OR barcode (tests A–J for receiving/helper parity).

  python -m pytest backend/tests/wms/test_wms_carrier_scan_ssot.py -q
"""

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
from backend.services.inventory_count.count_entry_service import resolve_carrier_by_code
from backend.services.inventory_count.errors import InventoryBarcodeNotFoundError
from backend.services.wms_carrier_service import find_carrier_by_scan_code, scan_carrier_by_barcode


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
    try:
        yield session
    finally:
        session.close()


def _carrier(
    db,
    *,
    code: str,
    barcode: str,
    carrier_id: int = 1,
) -> WarehouseCarrier:
    now = datetime.utcnow()
    c = WarehouseCarrier(
        id=carrier_id,
        tenant_id=1,
        code=code,
        barcode=barcode,
        status="ACTIVE",
        is_mixed=False,
        created_at=now,
        updated_at=now,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


def test_a_canonical_resolver_returns_carrier_by_code(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    row = find_carrier_by_scan_code(db, 1, "PAL-5")
    assert row is not None
    assert row.code == "PAL-5"
    assert row.barcode == "PAL-000005"


def test_b_carriers_scan_api_shape_found(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "PAL-5")
    assert out.found is True
    assert out.carrier is not None
    assert out.carrier.code == "PAL-5"
    assert out.carrier.barcode == "PAL-000005"


def test_c_receiving_same_resolver_as_scan(db):
    """Direct receiving path uses scan_carrier_by_barcode — same SSOT as Helper."""
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "PAL-5")
    assert out.found is True
    assert out.carrier is not None
    assert int(out.carrier.id) >= 1


def test_d_helper_dispatch_same_resolver(db):
    """Scanner Helper ultimately calls the same scan_carrier_by_barcode SSOT."""
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    via_helper_code = scan_carrier_by_barcode(db, 1, "PAL-5")
    via_direct = scan_carrier_by_barcode(db, 1, "PAL-5")
    assert via_helper_code.found == via_direct.found
    assert via_helper_code.carrier is not None and via_direct.carrier is not None
    assert via_helper_code.carrier.id == via_direct.carrier.id


def test_e_sscc_barcode_identical(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "PAL-000005")
    assert out.found is True
    assert out.carrier is not None
    assert out.carrier.id == find_carrier_by_scan_code(db, 1, "PAL-5").id


def test_f_whitespace_and_case(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    for raw in (" pal-5 ", "PAL-5", "Pal-5", "\tPAL-5\n"):
        out = scan_carrier_by_barcode(db, 1, raw)
        assert out.found is True, raw
        assert out.carrier is not None
        assert out.carrier.code == "PAL-5"


def test_g_unknown_carrier_not_found(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "PAL-999")
    assert out.found is False
    assert out.carrier is None
    with pytest.raises(InventoryBarcodeNotFoundError):
        resolve_carrier_by_code(db, tenant_id=1, code="PAL-999")


def test_h_product_ean_not_carrier(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "5901234567890")
    assert out.found is False


def test_i_location_code_not_carrier(db):
    _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "LOC-A01-01")
    assert out.found is False


def test_j_active_carrier_identity_for_next_receive(db):
    """After resolve, carrier id is stable for linking receive qty to PAL-5."""
    c = _carrier(db, code="PAL-5", barcode="PAL-000005")
    out = scan_carrier_by_barcode(db, 1, "PAL-5")
    assert out.found is True
    assert out.carrier is not None
    assert int(out.carrier.id) == int(c.id)
    # Inventory-count path shares SSOT
    resolved = resolve_carrier_by_code(db, tenant_id=1, code="PAL-5")
    assert int(resolved["carrier_id"]) == int(c.id)
    assert resolved["code"] == "PAL-5"
