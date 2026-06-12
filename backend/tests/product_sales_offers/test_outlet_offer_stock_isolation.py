"""E2E Etap 3A — outlet offer must not consume SALEABLE pool."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.product import Product
from backend.models.product_sales_offer import ProductSalesOffer
from backend.models.warehouse import Warehouse
from backend.schemas.order import OrderCreateLine
from backend.services.bundle_explosion import BundleExplosionError, resolve_order_create_lines
from backend.services.product_sales_offers import assert_offer_quantity_available, offer_available_qty
from backend.services.product_sales_offers.crud_service import create_outlet_offer_preset, ensure_default_offer_for_product
from backend.services.product_sales_offers.errors import OfferStockUnavailableError
from backend.services.product_sales_offers.price_service import effective_offer_sale_price_net
from backend.services.stock_disposition import STOCK_DISPOSITION_OUTLET_B, STOCK_DISPOSITION_SALEABLE


@pytest.fixture
def isolated_db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))

    for model in (Warehouse, Location, Product, Inventory, ProductSalesOffer):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    db = Session()

    db.add(Warehouse(id=1, tenant_id=1, name="Magazyn test"))
    db.add(Location(id=1, warehouse_id=1, name="A-01", is_active=True))
    product = Product(
        id=1,
        tenant_id=1,
        name="Produkt testowy",
        sku="SKU-TEST",
        ean="5900000000999",
        sale_price=99.0,
    )
    db.add(product)
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=1,
            quantity=100.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            location_id=1,
            product_id=1,
            quantity=1.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_OUTLET_B,
        )
    )
    db.commit()

    monkeypatch.setattr(
        "backend.services.product_sales_offers.stock_service._reserved_by_product_and_disposition",
        lambda _db, _tenant_id, _warehouse_id, _product_ids, _stock_disposition: {},
    )
    monkeypatch.setattr(
        "backend.services.product_disposition_snapshot_service._reserved_by_product_and_disposition",
        lambda _db, _tenant_id, _warehouse_id, _product_ids, _stock_disposition: {},
    )

    try:
        yield db, product
    finally:
        db.close()


def test_offer_available_qty_outlet_isolated(isolated_db) -> None:
    db, product = isolated_db
    ensure_default_offer_for_product(db, product=product)
    outlet = create_outlet_offer_preset(db, product=product)
    db.commit()

    saleable_offer = (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.product_id == int(product.id),
            ProductSalesOffer.stock_disposition == STOCK_DISPOSITION_SALEABLE,
        )
        .first()
    )
    assert saleable_offer is not None
    assert offer_available_qty(db, offer=saleable_offer, tenant_id=1, warehouse_id=1) == pytest.approx(100.0)
    assert offer_available_qty(db, offer=outlet, tenant_id=1, warehouse_id=1) == pytest.approx(1.0)


def test_outlet_offer_two_units_rejected_without_touching_saleable(isolated_db) -> None:
    db, product = isolated_db
    ensure_default_offer_for_product(db, product=product)
    outlet = create_outlet_offer_preset(db, product=product)
    db.commit()

    with pytest.raises(OfferStockUnavailableError) as exc:
        assert_offer_quantity_available(
            db,
            offer=outlet,
            tenant_id=1,
            warehouse_id=1,
            quantity=2.0,
        )
    msg = str(exc.value.detail)
    assert "OUTLET_B" in msg
    assert "2" in msg
    assert "1" in msg

    line = OrderCreateLine(offer_id=int(outlet.id), quantity=2)
    with pytest.raises(BundleExplosionError) as order_exc:
        resolve_order_create_lines(
            db,
            tenant_id=1,
            warehouse_id=1,
            raw_lines=[line],
            check_bundle_stock=True,
        )
    assert "OUTLET_B" in str(order_exc.value.detail)

    saleable_offer = (
        db.query(ProductSalesOffer)
        .filter(
            ProductSalesOffer.product_id == int(product.id),
            ProductSalesOffer.stock_disposition == STOCK_DISPOSITION_SALEABLE,
        )
        .first()
    )
    assert saleable_offer is not None
    assert offer_available_qty(db, offer=saleable_offer, tenant_id=1, warehouse_id=1) == pytest.approx(100.0)


def test_effective_price_falls_back_to_product() -> None:
    product = Product(id=1, tenant_id=1, name="P", sale_price=50.0)
    offer = ProductSalesOffer(
        tenant_id=1,
        product_id=1,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
        name="Standard",
        sale_price_net=None,
        is_default=True,
        active=True,
    )
    assert effective_offer_sale_price_net(offer, product) == pytest.approx(50.0)

    offer.sale_price_net = 45.0
    assert effective_offer_sale_price_net(offer, product) == pytest.approx(45.0)
