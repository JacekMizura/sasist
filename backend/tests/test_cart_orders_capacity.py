"""
Walidacja pojemności wózka (capacity_mode=orders) → HTTP 409 CART_CAPACITY_EXCEEDED.

  python -m pytest backend/tests/test_cart_orders_capacity.py -q
"""

from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.picking_assignment import PickingAssignmentConfig
from backend.services.cart_capacity_service import (
    CartCapacityExceeded,
    assert_cart_orders_capacity,
    count_orders_on_cart,
)
from backend.services.picking_assignment_service import PickingAssignmentService


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart, CartBasket, Order):
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


def _cart(db, *, max_orders: int = 2) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="WÓZ-CAP",
        code="CART-CAP",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_mode="orders",
        max_orders=max_orders,
    )
    db.add(c)
    db.flush()
    return c


def _order(db, *, number: str, cart_id: int | None = None) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        cart_id=cart_id,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
    )
    db.add(o)
    db.flush()
    return o


def test_assert_orders_capacity_raises_when_exceeded(db):
    cart = _cart(db)
    with pytest.raises(CartCapacityExceeded) as ei:
        assert_cart_orders_capacity(cart, current_orders=1, incoming_orders=2)
    exc = ei.value
    assert exc.code == "CART_CAPACITY_EXCEEDED"
    assert exc.to_detail() == {
        "code": "CART_CAPACITY_EXCEEDED",
        "current_orders": 1,
        "max_orders": 2,
        "attempted": 2,
    }


def test_assert_orders_capacity_ok_when_fits(db):
    cart = _cart(db)
    assert_cart_orders_capacity(cart, current_orders=1, incoming_orders=1)


def test_assert_skips_non_orders_mode(db):
    cart = _cart(db)
    cart.capacity_mode = "volume"
    assert_cart_orders_capacity(cart, current_orders=10, incoming_orders=50)


def test_picking_assignment_returns_409_when_orders_capacity_exceeded(db):
    cart = _cart(db, max_orders=2)
    _order(db, number="A", cart_id=cart.id)
    o2 = _order(db, number="B")
    o3 = _order(db, number="C")
    db.commit()

    assert count_orders_on_cart(db, cart.id) == 1

    svc = PickingAssignmentService(db)
    with pytest.raises(HTTPException) as ei:
        svc.assign_orders_to_cart(
            [o2.id, o3.id],
            cart.id,
            PickingAssignmentConfig(),
            tenant_id=1,
        )
    assert ei.value.status_code == 409
    assert ei.value.detail["code"] == "CART_CAPACITY_EXCEEDED"
    assert ei.value.detail["current_orders"] == 1
    assert ei.value.detail["max_orders"] == 2
    assert ei.value.detail["attempted"] == 2
