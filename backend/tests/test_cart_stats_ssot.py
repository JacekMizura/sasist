"""
SSOT cart stats from orders.cart_id / picking_session_id.

  python -m pytest backend/tests/test_cart_stats_ssot.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.cart_stats_service import compute_cart_stats, get_cart_stats_or_404


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart, CartBasket, Order, OrderItem, Product):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def test_stats_from_orders_cart_id(db):
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="C",
        code="C1",
        type=CartType.BULK,
        status=CartStatus.PICKING.value,
        total_volume=100.0,
        used_volume=0.0,
        capacity_mode="orders",
        max_orders=20,
        current_session_id=99,
    )
    db.add(cart)
    db.flush()

    p = Product(tenant_id=1, name="P", sku="SKU1", volume=1.0)
    db.add(p)
    db.flush()

    for i in range(10):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=f"O-{i}",
            status="PICKING",
            cart_id=cart.id,
            picking_session_id=99,
            total_volume_dm3=1.0,
            fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        )
        db.add(o)
        db.flush()
        db.add(OrderItem(order_id=o.id, product_id=p.id, quantity=1))

    db.commit()

    stats = compute_cart_stats(db, cart)
    assert stats["orders_count"] == 10
    assert stats["products_count"] == 1
    assert stats["sections_count"] == 1
    assert stats["occupied_sections"] == 10
    assert stats["volume_used"] == 10.0
    assert stats["percent_used"] == 50.0  # 10/20

    api_stats = get_cart_stats_or_404(db, cart.id)
    assert api_stats["orders_count"] == 10


def test_stats_zero_when_no_orders(db):
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="Empty",
        code="E1",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        total_volume=50.0,
        capacity_mode="volume",
    )
    db.add(cart)
    db.commit()
    stats = compute_cart_stats(db, cart)
    assert stats == {
        "orders_count": 0,
        "products_count": 0,
        "sections_count": 1,
        "occupied_sections": 0,
        "volume_used": 0.0,
        "percent_used": 0.0,
    }
