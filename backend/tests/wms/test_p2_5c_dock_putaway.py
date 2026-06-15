"""P2.5C — DOCK / ATP / putaway implementation tests."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.stock_reservation import StockReservation
from backend.models.pick import Pick
from backend.models.warehouse import Warehouse
from backend.services.commercial_availability_service import commercially_sellable_qty
from backend.services.pick_eligible_inventory_service import (
    SYSTEM_DOCK_IN_NAME,
    SYSTEM_STOCK_NAME,
    is_pick_eligible_location,
)
from backend.services.picking_routing_service import PickingRoutingService
from backend.services.product_disposition_snapshot_service import get_product_disposition_stock
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.stock_document_service import ensure_default_pz_receiving_location_if_missing
from backend.services.warehouse_receiving_location_service import (
    ensure_dock_in_location,
    ensure_stock_location,
    ensure_warehouse_system_receiving_location,
)
from backend.services.wms_receiving_service import _apply_dock_inventory_for_receipt


@pytest.fixture
def p25c_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (
        Warehouse,
        Location,
        Product,
        Inventory,
        StockDocument,
        StockDocumentItem,
        StockOperation,
        StockReservation,
        Pick,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    monkeypatch.setattr(
        "backend.services.commercial_availability_service._total_saleable_issued_by_product",
        lambda _db, **_kw: {},
    )
    monkeypatch.setattr(
        "backend.services.product_disposition_snapshot_service._reserved_by_product_and_disposition",
        lambda _db, _tenant_id, _warehouse_id, _product_ids, _stock_disposition: {},
    )

    product = Product(
        id=1,
        tenant_id=1,
        name="Produkt test",
        sku="SKU-1",
        ean="5900000000001",
        sale_price=10.0,
    )
    db.add(product)
    db.commit()

    try:
        yield db, product
    finally:
        db.close()


def _wh(db, *, wh_id: int, requires_putaway: bool) -> Warehouse:
    wh = Warehouse(id=wh_id, tenant_id=1, name=f"WH-{wh_id}", requires_putaway=requires_putaway)
    db.add(wh)
    db.flush()
    return wh


def _inv(db, *, wh_id: int, loc_id: int, qty: float) -> None:
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=wh_id,
            location_id=loc_id,
            product_id=1,
            quantity=qty,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()


class TestWarehouseProfiles:
    def test_provisions_dock_in_for_wms(self, p25c_db):
        db, _ = p25c_db
        wh = _wh(db, wh_id=1, requires_putaway=True)
        loc = ensure_warehouse_system_receiving_location(db, int(wh.id))
        assert loc.name == SYSTEM_DOCK_IN_NAME
        assert loc.location_type == "DOCK"
        again = ensure_dock_in_location(db, int(wh.id))
        assert again.id == loc.id

    def test_provisions_stock_for_simple_warehouse(self, p25c_db):
        db, _ = p25c_db
        wh = _wh(db, wh_id=2, requires_putaway=False)
        loc = ensure_warehouse_system_receiving_location(db, int(wh.id))
        assert loc.name == SYSTEM_STOCK_NAME
        assert loc.type == "pick"
        again = ensure_stock_location(db, int(wh.id))
        assert again.id == loc.id


class TestReceivingA3:
    def test_pz_gets_dock_and_inventory_on_receive_wms(self, p25c_db):
        db, product = p25c_db
        wh = _wh(db, wh_id=1, requires_putaway=True)
        dock = ensure_dock_in_location(db, int(wh.id))
        doc = StockDocument(
            id=1,
            tenant_id=1,
            warehouse_id=int(wh.id),
            document_type="PZ",
            status="draft",
        )
        line = StockDocumentItem(
            id=1,
            document_id=1,
            product_id=int(product.id),
            ordered_quantity=10,
            received_quantity=0,
            quantity=0,
        )
        db.add(doc)
        db.add(line)
        db.commit()

        ensure_default_pz_receiving_location_if_missing(db, doc)
        assert doc.location_id == int(dock.id)

        class FakeUser:
            id = 1

        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=1,
            doc=doc,
            line=line,
            add_qty=5.0,
            warehouse_carrier_id=None,
            performed_by=FakeUser(),
        )
        db.commit()

        inv = db.query(Inventory).filter(Inventory.warehouse_id == int(wh.id)).all()
        assert len(inv) == 1
        assert float(inv[0].quantity) == 5.0
        assert int(inv[0].location_id) == int(dock.id)

    def test_simple_warehouse_receive_to_stock(self, p25c_db):
        db, product = p25c_db
        wh = _wh(db, wh_id=2, requires_putaway=False)
        stock = ensure_stock_location(db, int(wh.id))
        doc = StockDocument(
            id=2,
            tenant_id=1,
            warehouse_id=int(wh.id),
            document_type="PZ",
            status="draft",
        )
        line = StockDocumentItem(
            id=2,
            document_id=2,
            product_id=int(product.id),
            ordered_quantity=10,
            received_quantity=0,
            quantity=0,
        )
        db.add(doc)
        db.add(line)
        db.commit()

        ensure_default_pz_receiving_location_if_missing(db, doc)
        assert doc.location_id == int(stock.id)

        class FakeUser:
            id = 1

        _apply_dock_inventory_for_receipt(
            db,
            tenant_id=1,
            doc=doc,
            line=line,
            add_qty=3.0,
            warehouse_carrier_id=None,
            performed_by=FakeUser(),
        )
        db.commit()

        inv = db.query(Inventory).filter(Inventory.location_id == int(stock.id)).one()
        assert float(inv.quantity) == 3.0


class TestAtpAndPicking:
    def test_dock_inventory_physical_but_not_atp_wms(self, p25c_db):
        db, _ = p25c_db
        wh = _wh(db, wh_id=1, requires_putaway=True)
        dock = ensure_dock_in_location(db, int(wh.id))
        pick_loc = Location(
            warehouse_id=int(wh.id),
            name="A-01",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
        db.add(pick_loc)
        db.flush()
        _inv(db, wh_id=int(wh.id), loc_id=int(dock.id), qty=10.0)

        snap = get_product_disposition_stock(
            db, product_id=1, tenant_id=1, warehouse_id=int(wh.id)
        )
        assert snap["physical_qty"] == 10.0
        assert snap["saleable_qty"] == 10.0
        assert snap["dock_qty"] == 10.0
        assert snap["saleable_available_qty"] == 0.0
        assert commercially_sellable_qty(db, tenant_id=1, warehouse_id=int(wh.id), product_id=1) == 0.0

    def test_stock_location_immediately_atp_simple_warehouse(self, p25c_db):
        db, _ = p25c_db
        wh = _wh(db, wh_id=2, requires_putaway=False)
        stock = ensure_stock_location(db, int(wh.id))
        _inv(db, wh_id=int(wh.id), loc_id=int(stock.id), qty=7.0)

        snap = get_product_disposition_stock(
            db, product_id=1, tenant_id=1, warehouse_id=int(wh.id)
        )
        assert snap["saleable_available_qty"] == 7.0
        assert snap["dock_qty"] == 0.0

    def test_picking_routing_excludes_dock(self, p25c_db):
        db, _ = p25c_db
        wh = _wh(db, wh_id=1, requires_putaway=True)
        dock = ensure_dock_in_location(db, int(wh.id))
        pick_loc = Location(
            warehouse_id=int(wh.id),
            name="B-01",
            type="pick",
            location_type="NORMAL",
            is_active=True,
        )
        db.add(pick_loc)
        db.flush()
        _inv(db, wh_id=int(wh.id), loc_id=int(dock.id), qty=100.0)
        _inv(db, wh_id=int(wh.id), loc_id=int(pick_loc.id), qty=2.0)

        svc = PickingRoutingService(db)
        cache = svc._load_inventory_by_warehouse_product({(int(wh.id), 1)})
        loc_ids = [x[0] for x in cache.get((int(wh.id), 1), [])]
        assert int(dock.id) not in loc_ids
        assert int(pick_loc.id) in loc_ids


class TestPickEligibleHelper:
    def test_dock_excluded_when_requires_putaway(self):
        assert is_pick_eligible_location(requires_putaway=True, location_type="DOCK") is False
        assert is_pick_eligible_location(requires_putaway=False, location_type="NORMAL") is True
        assert is_pick_eligible_location(requires_putaway=True, location_type="NORMAL") is True
