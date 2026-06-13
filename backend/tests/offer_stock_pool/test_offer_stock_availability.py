"""Offer stock pool availability — Warsaw/Poznań/Gdańsk scenario."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.offer_stock_pool import OfferStockPool, OfferStockPoolWarehouse
from backend.models.product import Product
from backend.models.product_sales_offer import ProductSalesOffer
from backend.models.tenant_warehouse import TenantWarehouse
from backend.models.warehouse import Warehouse
from backend.services.offer_stock_availability_service import offer_pool_available_qty
from backend.services.offer_stock_pool_service import create_pool
from backend.services.product_sales_offers.crud_service import ensure_default_offer_for_product


@pytest.fixture
def pool_availability_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (
        Warehouse,
        TenantWarehouse,
        Product,
        ProductSalesOffer,
        OfferStockPool,
        OfferStockPoolWarehouse,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    for wid, name in ((1, "Warszawa"), (2, "Poznań"), (3, "Gdańsk")):
        db.add(Warehouse(id=wid, tenant_id=1, name=name))
        db.add(
            TenantWarehouse(
                tenant_id=1,
                warehouse_id=wid,
                role="operator" if wid > 1 else "owner",
                is_default=1 if wid == 1 else 0,
                participates_in_network_stock=True,
                fulfillment_eligible=True,
                fulfillment_priority=wid,
            )
        )

    product = Product(id=1, tenant_id=1, name="Test", sku="SKU-1", sale_price=10.0)
    db.add(product)
    db.commit()

    qty_by_wh = {1: 20.0, 2: 30.0, 3: 40.0}

    def _fake_offer_qty(_db, *, offer, tenant_id, warehouse_id):
        return qty_by_wh.get(int(warehouse_id), 0.0)

    monkeypatch.setattr(
        "backend.services.offer_stock_availability_service.offer_available_qty",
        _fake_offer_qty,
    )

    try:
        yield db, product
    finally:
        db.close()


def _pool_with_warehouses(db, *, name: str, warehouse_ids: list[int]) -> OfferStockPool:
    return create_pool(db, tenant_id=1, name=name, warehouse_ids=warehouse_ids, is_default=False)


def test_pool_a_warsaw_poznan_sums_50(pool_availability_db):
    db, product = pool_availability_db
    offer = ensure_default_offer_for_product(db, product=product)
    pool = _pool_with_warehouses(db, name="Pool A", warehouse_ids=[1, 2])
    offer.stock_pool_id = int(pool.id)
    db.commit()

    assert offer_pool_available_qty(db, offer=offer, tenant_id=1) == 50.0


def test_pool_b_gdansk_only_40(pool_availability_db):
    db, product = pool_availability_db
    offer = ensure_default_offer_for_product(db, product=product)
    pool = _pool_with_warehouses(db, name="Pool B", warehouse_ids=[3])
    offer.stock_pool_id = int(pool.id)
    db.commit()

    assert offer_pool_available_qty(db, offer=offer, tenant_id=1) == 40.0


def test_pool_c_all_warehouses_90(pool_availability_db):
    db, product = pool_availability_db
    offer = ensure_default_offer_for_product(db, product=product)
    pool = _pool_with_warehouses(db, name="Pool C", warehouse_ids=[1, 2, 3])
    offer.stock_pool_id = int(pool.id)
    db.commit()

    assert offer_pool_available_qty(db, offer=offer, tenant_id=1) == 90.0


def test_null_stock_pool_id_uses_default_pool(pool_availability_db):
    db, product = pool_availability_db
    offer = ensure_default_offer_for_product(db, product=product)
    default = _pool_with_warehouses(db, name="Pool domyślny", warehouse_ids=[1, 2])
    default.is_default = True
    offer.stock_pool_id = None
    db.commit()

    assert offer_pool_available_qty(db, offer=offer, tenant_id=1) == 50.0
