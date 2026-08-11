"""
warehouse_stock (suma magazynu) vs primary_location_stock (stan lokalizacji) — zbieranie.

  python -m pytest backend/tests/test_wms_picking_warehouse_vs_location_stock.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_picking_product_list_service import (
    _inventory_sums_by_product_location,
    _warehouse_on_hand_by_product,
)

LOC_B1 = 201
LOC_S1 = 202
PRODUCT_ID = 501


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Product, Location, Inventory):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=PRODUCT_ID, tenant_id=1, name="X", sku="SKU", ean="590"))
    session.add(Location(id=LOC_B1, warehouse_id=1, name="B1-A-1", is_active=True))
    session.add(Location(id=LOC_S1, warehouse_id=1, name="S1-A-2", is_active=True))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _inv(db, loc_id: int, qty: float):
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PRODUCT_ID,
            location_id=loc_id,
            quantity=float(qty),
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )


def test_warehouse_stock_is_sum_of_locations_not_primary_only(db):
    _inv(db, LOC_B1, 74.0)
    _inv(db, LOC_S1, 4.0)
    db.commit()

    wh = _warehouse_on_hand_by_product(
        db, tenant_id=1, warehouse_id=1, product_ids=[PRODUCT_ID]
    )
    loc = _inventory_sums_by_product_location(
        db,
        tenant_id=1,
        warehouse_id=1,
        pairs=[(PRODUCT_ID, LOC_B1), (PRODUCT_ID, LOC_S1)],
    )

    assert wh[PRODUCT_ID] == pytest.approx(78.0)
    assert loc[(PRODUCT_ID, LOC_B1)] == pytest.approx(74.0)
    assert loc[(PRODUCT_ID, LOC_S1)] == pytest.approx(4.0)
    assert wh[PRODUCT_ID] != loc[(PRODUCT_ID, LOC_B1)]
