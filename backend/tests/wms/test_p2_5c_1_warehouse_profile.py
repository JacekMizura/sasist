"""P2.5C.1 — warehouse profile change validation."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.warehouse import Warehouse
from backend.services.warehouse_profile_change_service import validate_requires_putaway_change
from backend.services.warehouse_receiving_location_service import ensure_dock_in_location
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE


@pytest.fixture
def wh_profile_db():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (Warehouse, Location, Product, Inventory, StockDocument, StockDocumentItem):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()
    wh = Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True)
    db.add(wh)
    db.commit()
    try:
        yield db, wh
    finally:
        db.close()


def test_allows_change_when_idle(wh_profile_db):
    db, wh = wh_profile_db
    assert validate_requires_putaway_change(db, warehouse_id=int(wh.id), new_requires_putaway=False) == []


def test_blocks_true_to_false_with_dock_inventory(wh_profile_db):
    db, wh = wh_profile_db
    dock = ensure_dock_in_location(db, int(wh.id))
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=int(wh.id),
            location_id=int(dock.id),
            product_id=1,
            quantity=5.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.add(Product(id=1, tenant_id=1, name="P", sku="S"))
    db.commit()

    blocks = validate_requires_putaway_change(db, warehouse_id=int(wh.id), new_requires_putaway=False)
    assert any(b.code == "DOCK_INVENTORY" for b in blocks)


def test_blocks_when_receiving_in_progress(wh_profile_db):
    db, wh = wh_profile_db
    doc = StockDocument(
        tenant_id=1,
        warehouse_id=int(wh.id),
        document_type="PZ",
        status="draft",
        receiving_status="IN_PROGRESS",
    )
    db.add(doc)
    db.commit()

    blocks = validate_requires_putaway_change(db, warehouse_id=int(wh.id), new_requires_putaway=False)
    assert any(b.code == "ACTIVE_RECEIVING" for b in blocks)
