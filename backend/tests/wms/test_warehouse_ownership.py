"""P2 — warehouse ownership model tests."""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.auth.warehouse_deps import assert_resource_warehouse
from backend.models.app_user import AppUser, UserWmsProfile
from backend.models.user_warehouse_assignment import UserWarehouseAssignment
from backend.models.consolidation_rack import ConsolidationRack
from backend.models.location import Location
from backend.models.order import Order
from backend.models.pick_task import PickTask
from backend.models.picking_zone import PickingZone
from backend.models.product import Product
from backend.models.stock_document import StockDocument
from backend.models.warehouse import Warehouse
from backend.models.warehouse_carrier import WarehouseCarrier
from backend.services.user_warehouse_context_service import sync_user_warehouse_assignments
from backend.services.wms_warehouse_ownership_service import (
    StockDocumentWarehouseRequiredError,
    apply_mm_warehouse_ids_to_document,
    register_stock_document_warehouse_guard,
    resolve_mm_warehouse_ids,
    resolve_pick_task_warehouse_id,
    sync_carrier_current_warehouse,
    validate_new_stock_document_warehouse_id,
)


@pytest.fixture
def ownership_db(monkeypatch):
    monkeypatch.setenv("WMS_ENFORCE_WAREHOUSE_ASSIGNMENTS", "hard")
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (
        AppUser,
        UserWmsProfile,
        UserWarehouseAssignment,
        Warehouse,
        Location,
        Order,
        Product,
        PickTask,
        WarehouseCarrier,
        StockDocument,
        PickingZone,
        ConsolidationRack,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(AppUser(id=1, login="op", email="op@test.pl", password_hash="x", role="user", is_active=True))
    db.add(Warehouse(id=1, tenant_id=1, name="Warszawa"))
    db.add(Warehouse(id=2, tenant_id=1, name="Poznań"))
    db.add(Location(id=10, warehouse_id=1, name="A-1"))
    db.add(Location(id=20, warehouse_id=2, name="B-1"))
    db.add(Order(id=100, tenant_id=1, warehouse_id=1, number="O-1"))
    db.add(Product(id=5, tenant_id=1, name="SKU-1", sku="SKU-1"))
    db.commit()

    sync_user_warehouse_assignments(db, user_id=1, warehouse_ids=[1, 2], default_warehouse_id=1)
    db.commit()

    try:
        yield db
    finally:
        db.close()


def test_pick_task_warehouse_from_location(ownership_db):
    db = ownership_db
    wid = resolve_pick_task_warehouse_id(db, location_id=10, order_id=100)
    assert wid == 1

    task = PickTask(
        tenant_id=1,
        order_id=100,
        product_id=5,
        location_id=10,
        warehouse_id=wid,
        quantity=1.0,
        batch_number="",
        expiry_date=date(9999, 12, 31),
    )
    db.add(task)
    db.commit()
    assert task.warehouse_id == 1


def test_carrier_relocation_updates_current_warehouse(ownership_db):
    db = ownership_db
    carrier = WarehouseCarrier(
        tenant_id=1,
        code="PAL-1",
        barcode="PAL-1",
        current_location_id=10,
        status="ACTIVE",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(carrier)
    db.flush()
    sync_carrier_current_warehouse(carrier, db)
    assert carrier.current_warehouse_id == 1

    carrier.current_location_id = 20
    sync_carrier_current_warehouse(carrier, db, location_id=20)
    assert carrier.current_warehouse_id == 2


def test_stock_document_without_warehouse_blocked(ownership_db):
    db = ownership_db
    register_stock_document_warehouse_guard()

    with pytest.raises(StockDocumentWarehouseRequiredError):
        validate_new_stock_document_warehouse_id(None, context="PZ")

    doc = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=None,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(doc)
    with pytest.raises(StockDocumentWarehouseRequiredError):
        db.commit()
    db.rollback()

    ok = StockDocument(
        tenant_id=1,
        document_type="PZ",
        warehouse_id=1,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(ok)
    db.commit()
    assert ok.warehouse_id == 1


def test_zone_and_consolidation_rack_ownership(ownership_db):
    db = ownership_db
    user = db.query(AppUser).filter(AppUser.id == 1).first()
    zone = PickingZone(id=1, tenant_id=1, warehouse_id=1, name="Strefa A")
    rack = ConsolidationRack(id=1, tenant_id=1, warehouse_id=2, name="Regał 1")
    db.add_all([zone, rack])
    db.commit()

    assert assert_resource_warehouse(db, user, zone) == 1
    assert assert_resource_warehouse(db, user, rack) == 2


def test_mm_source_and_destination_warehouse(ownership_db):
    db = ownership_db
    doc = StockDocument(
        tenant_id=1,
        document_type="MM",
        warehouse_id=None,
        mm_from_location_id=10,
        mm_to_location_id=20,
        status="draft",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    src, dst = resolve_mm_warehouse_ids(db, doc)
    assert src == 1
    assert dst == 2

    apply_mm_warehouse_ids_to_document(db, doc)
    assert doc.source_warehouse_id == 1
    assert doc.destination_warehouse_id == 2
    assert doc.warehouse_id == 1
