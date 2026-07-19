"""
Order create + sales offers: phantom offer_id / domain errors.

  python -m pytest backend/tests/product_sales_offers/test_order_create_offer_contract.py -q
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.product_sales_offers import list_product_sales_offers
from backend.models.product import Product
from backend.models.product_sales_offer import ProductSalesOffer
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.order import OrderCreateBody, OrderCreateLine
from backend.services.bundle_explosion import resolve_order_create_lines
from backend.services.product_sales_offers import ProductSalesOfferError, resolve_offer_for_order_line
from backend.services.product_sales_offers.crud_service import ensure_default_offer_for_product


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for m in (Tenant, Warehouse, Product, ProductSalesOffer):
        m.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        Product(id=100, tenant_id=1, sku="SKU-100", name="P100", ean="5900000000100", sale_price=10.0)
    )
    session.add(
        Product(id=200, tenant_id=1, sku="SKU-200", name="P200", ean="5900000000200", sale_price=20.0)
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_case_list_ensure_commits_offer_survives_new_session(db, monkeypatch):
    """GET list must commit ensure_default — otherwise FE gets phantom offer_id."""
    monkeypatch.setattr(
        "backend.api.product_sales_offers.offer_pool_available_qty",
        lambda *a, **k: 0.0,
    )
    monkeypatch.setattr(
        "backend.api.product_sales_offers.offer_to_read_dict",
        lambda db, *, offer, product, available_qty: {
            "id": int(offer.id),
            "product_id": int(offer.product_id),
            "stock_disposition": str(offer.stock_disposition),
            "name": str(offer.name),
            "sale_price_net": None,
            "effective_sale_price_net": 10.0,
            "uses_product_price": True,
            "is_default": bool(offer.is_default),
            "active": bool(offer.active),
            "available_qty": 0.0,
            "stock_pool_id": None,
            "stock_pool_name": None,
        },
    )
    engine = db.get_bind()
    Session = sessionmaker(bind=engine)

    s1 = Session()
    out = list_product_sales_offers(product_id=100, tenant_id=1, warehouse_id=1, db=s1)
    assert len(out.offers) >= 1
    offer_id = int(out.offers[0].id)
    product_id = int(out.offers[0].product_id)
    assert product_id == 100
    # Real offer row id is ProductSalesOffer.id, not CatalogProduct.id (may coincide by chance).
    s1.close()

    s2 = Session()
    row = (
        s2.query(ProductSalesOffer)
        .filter(ProductSalesOffer.id == offer_id, ProductSalesOffer.tenant_id == 1)
        .first()
    )
    assert row is not None, "offer vanished after GET session close — missing commit on list ensure"
    assert bool(row.active) is True
    s2.close()


def test_case2_product_id_not_confused_with_offer_id(db):
    ensure_default_offer_for_product(
        db, product=db.query(Product).filter(Product.id == 100).one()
    )
    db.commit()
    offer = db.query(ProductSalesOffer).filter(ProductSalesOffer.product_id == 100).one()
    # If someone sent product.id as offer_id and ids differ → not found
    if int(offer.id) != 100:
        with pytest.raises(ProductSalesOfferError) as ei:
            resolve_offer_for_order_line(db, tenant_id=1, offer_id=100)
        assert ei.value.code == "offer_not_found"


def test_case3_missing_offer_raises_domain_error(db):
    with pytest.raises(ProductSalesOfferError) as ei:
        resolve_offer_for_order_line(db, tenant_id=1, offer_id=999999)
    assert ei.value.code == "offer_not_found"
    assert int(ei.value.http_status) == 400


def test_case4_inactive_offer_not_found(db):
    p = db.query(Product).filter(Product.id == 100).one()
    offer = ensure_default_offer_for_product(db, product=p)
    db.flush()
    offer.active = False
    db.add(offer)
    db.commit()
    with pytest.raises(ProductSalesOfferError) as ei:
        resolve_offer_for_order_line(db, tenant_id=1, offer_id=int(offer.id))
    assert ei.value.code == "offer_not_found"


def test_case5_other_tenant_rejected(db):
    p = db.query(Product).filter(Product.id == 100).one()
    offer = ensure_default_offer_for_product(db, product=p)
    db.commit()
    with pytest.raises(ProductSalesOfferError):
        resolve_offer_for_order_line(db, tenant_id=2, offer_id=int(offer.id))


def test_case6_three_products_via_product_id_resolve(db):
    p3 = Product(id=300, tenant_id=1, sku="SKU-300", name="P300", ean="5900000000300", sale_price=30.0)
    db.add(p3)
    db.commit()
    lines = [
        OrderCreateLine(product_id=100, quantity=1, unit_price=10),
        OrderCreateLine(product_id=200, quantity=2, unit_price=20),
        OrderCreateLine(product_id=300, quantity=1, unit_price=30),
    ]
    result = resolve_order_create_lines(
        db,
        tenant_id=1,
        warehouse_id=1,
        raw_lines=lines,
        check_bundle_stock=False,
    )
    assert len(result.lines) == 3
    assert all(r.product_sales_offer_id is not None for r in result.lines)


def test_case7_create_order_maps_offer_error_to_400(db, monkeypatch):
    from backend.api import order as order_api

    monkeypatch.setattr(order_api, "ensure_orders_create_schema", lambda eng: None)

    body = OrderCreateBody(
        tenant_id=1,
        warehouse_id=1,
        shipping_cost=0,
        items=[OrderCreateLine(offer_id=424242, quantity=1, unit_price=1)],
        check_bundle_stock=False,
    )
    with pytest.raises(HTTPException) as ei:
        order_api.create_order(body, db)
    assert ei.value.status_code == 400
    detail = ei.value.detail
    assert isinstance(detail, dict)
    assert detail.get("code") == "OFFER_NOT_FOUND"
