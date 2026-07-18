"""
detach_order_from_cart — single order detach via CartLifecycleService.

  python -m pytest backend/tests/test_cart_detach_order.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    CartLifecycleError,
    claim_cart,
    detach_order_from_cart,
    get_cart_status,
    start_picking,
)
from backend.services.cart_stats_service import list_orders_on_cart


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Cart,
        CartBasket,
        Order,
        Product,
        Pick,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
    ):
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


@pytest.fixture(autouse=True)
def _bypass_wms_validation_gate_for_detach_unit_tests(monkeypatch):
    def _pass_through(db, *, orders, tenant_id, warehouse_id, operator_user_id=None):
        return list(orders)

    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        _pass_through,
    )


def _cart(db) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="WOZ-D",
        code="CART-DETACH",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=20,
    )
    db.add(c)
    db.flush()
    return c


def _order(db, number: str) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        total_volume_dm3=1.0,
    )
    db.add(o)
    db.flush()
    return o


def test_detach_order_without_picks(db):
    cart = _cart(db)
    o1 = _order(db, "D-1")
    o2 = _order(db, "D-2")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=1)
    db.commit()

    out = detach_order_from_cart(
        db,
        cart_id=int(cart.id),
        order_id=int(o1.id),
        tenant_id=1,
        warehouse_id=1,
        operator_user_id=99,
    )
    db.commit()

    assert out["orders_detached"] == 1
    assert out["remaining_orders"] == 1
    assert out["cart_released"] is False
    db.refresh(o1)
    db.refresh(o2)
    assert o1.cart_id is None
    assert o2.cart_id == cart.id
    assert len(list_orders_on_cart(db, cart)) == 1
    assert get_cart_status(cart) == CartStatus.PICKING

    ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "order_detached",
        )
        .order_by(CartLifecycleEvent.id.desc())
        .first()
    )
    assert ev is not None
    assert ev.operator_user_id == 99


def test_detach_blocked_when_pick_exists(db):
    cart = _cart(db)
    o1 = _order(db, "D-3")
    p = Product(tenant_id=1, name="P", sku="SKU-D", volume=1.0)
    db.add(p)
    db.flush()
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()

    # Minimal pick row — location_id required NOT NULL; use 1 as stub for SQLite test
    # Create locations table? Pick requires location_id FK — may fail.
    # Use order_has_picking_progress path by inserting via raw if needed.
    # Prefer creating a Location model or skip FK with pragma.
    db.execute(
        __import__("sqlalchemy").text("PRAGMA foreign_keys=OFF")
    )
    pick = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=int(o1.id),
        product_id=int(p.id),
        location_id=1,
        cart_id=int(cart.id),
        quantity=1.0,
    )
    db.add(pick)
    db.commit()

    with pytest.raises(CartLifecycleError) as ei:
        detach_order_from_cart(
            db,
            cart_id=int(cart.id),
            order_id=int(o1.id),
            tenant_id=1,
            warehouse_id=1,
            operator_user_id=99,
        )
    assert ei.value.code == "OrderDetachBlocked"
    assert "rozpoczęto już jego kompletację" in ei.value.message


def test_detach_last_order_releases_cart(db):
    cart = _cart(db)
    o1 = _order(db, "D-4")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()

    out = detach_order_from_cart(
        db,
        cart_id=int(cart.id),
        order_id=int(o1.id),
        tenant_id=1,
        warehouse_id=1,
        operator_user_id=99,
    )
    db.commit()
    assert out["remaining_orders"] == 0
    assert out["cart_released"] is True
    assert get_cart_status(cart) == CartStatus.AVAILABLE
