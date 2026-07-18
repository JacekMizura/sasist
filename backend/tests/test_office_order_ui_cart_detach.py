"""
Panel UI status change → CartLifecycle detach (invariant).

  python -m pytest backend/tests/test_office_order_ui_cart_detach.py -q
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
from backend.models.order_ui_status import OrderUiStatus
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    claim_cart,
    get_cart_status,
    start_picking,
)
from backend.services.cart_stats_service import list_orders_on_cart
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status


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
        OrderUiStatus,
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
def _bypass_validation(monkeypatch):
    def _pass(db, *, orders, tenant_id, warehouse_id, operator_user_id=None):
        return list(orders)

    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        _pass,
    )


def _cart(db) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="P",
        code="PANEL-1",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        total_volume=999.0,
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


def test_panel_status_change_detaches_via_cart_lifecycle(db):
    st = OrderUiStatus(
        tenant_id=1, warehouse_id=1, main_group="PROBLEM", name="Do weryfikacji", color="#f59e0b"
    )
    db.add(st)
    db.flush()

    cart = _cart(db)
    o1 = _order(db, "P-1")
    o2 = _order(db, "P-2")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=5)
    start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=5)
    db.commit()
    db.refresh(o1)
    assert o1.cart_id == cart.id

    out = apply_order_panel_ui_status(
        db, order=o1, sub_status_id=int(st.id), operator_user_id=99
    )
    db.commit()

    assert out["detached"] is True
    db.refresh(o1)
    db.refresh(o2)
    db.refresh(cart)
    assert o1.cart_id is None
    assert o1.picking_session_id is None
    assert o1.basket_id is None
    assert o1.order_ui_status_id == int(st.id)
    assert o2.cart_id == cart.id
    assert len(list_orders_on_cart(db, cart)) == 1
    assert get_cart_status(cart) == CartStatus.PICKING

    ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "order_detached",
            CartLifecycleEvent.order_id == int(o1.id),
        )
        .one()
    )
    assert ev.operator_user_id == 99


def test_panel_status_last_order_releases_cart(db):
    st = OrderUiStatus(
        tenant_id=1, warehouse_id=1, main_group="PROBLEM", name="X", color="#f59e0b"
    )
    db.add(st)
    db.flush()
    cart = _cart(db)
    o1 = _order(db, "LAST-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()

    apply_order_panel_ui_status(db, order=o1, sub_status_id=int(st.id), operator_user_id=None)
    db.commit()
    db.refresh(o1)
    db.refresh(cart)
    assert o1.cart_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert len(list_orders_on_cart(db, cart)) == 0


def test_panel_status_without_cart_no_lifecycle_detach_event(db):
    st = OrderUiStatus(
        tenant_id=1, warehouse_id=1, main_group="NEW", name="Nowe", color="#64748b"
    )
    db.add(st)
    db.flush()
    o = _order(db, "FREE-1")
    db.commit()
    assert o.cart_id is None

    out = apply_order_panel_ui_status(db, order=o, sub_status_id=int(st.id), operator_user_id=3)
    db.commit()
    assert out["detached"] is False
    db.refresh(o)
    assert o.order_ui_status_id == int(st.id)
    assert o.cart_id is None
    assert (
        db.query(CartLifecycleEvent).filter(CartLifecycleEvent.event_code == "order_detached").count()
        == 0
    )
