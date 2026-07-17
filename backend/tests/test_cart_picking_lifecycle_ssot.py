"""
Integracja SSOT: przypisanie → sesja zbierania → koniec zbierania → pakowanie → zwolnienie wózka.

  python -m pytest backend/tests/test_cart_picking_lifecycle_ssot.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    cancel_picking_session,
    complete_picking_keep_cart,
    ensure_picking_session_for_cart,
    get_cart_status,
    release_cart_after_last_order_packed,
)
from backend.services.order_fulfillment_state import PACKING, PICKING


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart, CartBasket, Order, WmsOperationSession):
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


def _cart(db) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="WÓZ-001",
        code="CART-001",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_mode="volume",
    )
    db.add(c)
    db.flush()
    return c


def _order(db, *, number: str, status: str = "NEW") -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status=status,
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
    )
    db.add(o)
    db.flush()
    return o


def test_assign_picking_finish_pack_release_cart(db):
    cart = _cart(db)
    o1 = _order(db, number="A-1")
    o2 = _order(db, number="A-2")
    db.commit()

    # 1) Przypisanie → picking_session + cart_id + picking_session_id + PICKING
    sess = ensure_picking_session_for_cart(
        db,
        cart=cart,
        orders=[o1, o2],
        operator_user_id=7,
        source_status_id=10,
    )
    db.commit()

    assert sess.id is not None
    assert cart.current_session_id == sess.id
    assert cart.assigned_user_id == 7
    assert get_cart_status(cart) == CartStatus.PICKING
    for o in (o1, o2):
        db.refresh(o)
        assert o.cart_id == cart.id
        assert o.picking_session_id == sess.id
        assert (o.fulfillment_state or "").upper() == PICKING
        assert (o.status or "").upper() == "PICKING_IN_PROGRESS"

    # 2) Koniec zbierania — NIE odpinaj wózka; READY_FOR_PACKING + PACKING
    complete_picking_keep_cart(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    db.commit()
    db.refresh(cart)
    db.refresh(o1)
    db.refresh(o2)

    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING
    assert o1.cart_id == cart.id
    assert o2.cart_id == cart.id
    assert o1.picking_session_id == sess.id
    assert (o1.fulfillment_state or "").upper() == PACKING
    assert (o1.status or "").upper() == "PACKING"

    # 3) Spakuj pierwsze — wózek zostaje
    released = release_cart_after_last_order_packed(
        db,
        cart_id=cart.id,
        tenant_id=1,
        warehouse_id=1,
        packed_order_id=int(o1.id),
    )
    db.commit()
    assert released is False
    db.refresh(cart)
    db.refresh(o1)
    db.refresh(o2)
    assert o1.cart_id is None
    assert o2.cart_id == cart.id
    assert get_cart_status(cart) == CartStatus.PACKING

    # 4) Spakuj ostatnie — zwolnij wózek
    released2 = release_cart_after_last_order_packed(
        db,
        cart_id=cart.id,
        tenant_id=1,
        warehouse_id=1,
        packed_order_id=int(o2.id),
    )
    db.commit()
    assert released2 is True
    db.refresh(cart)
    db.refresh(o2)
    assert o2.cart_id is None
    assert o2.picking_session_id is None
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert cart.current_session_id is None


def test_cancel_picking_restores_orders_and_frees_cart(db):
    cart = _cart(db)
    o1 = _order(db, number="B-1", status="NEW")
    db.commit()

    ensure_picking_session_for_cart(db, cart=cart, orders=[o1], operator_user_id=3, source_status_id=10)
    db.commit()
    assert o1.cart_id == cart.id

    out = cancel_picking_session(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        operator_user_id=3,
    )
    db.commit()
    db.refresh(cart)
    db.refresh(o1)

    assert out["cart_status"] == CartStatus.AVAILABLE.value
    assert o1.cart_id is None
    assert o1.picking_session_id is None
    assert (o1.status or "").upper() == "NEW"
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert cart.current_session_id is None


def test_assert_quick_pick_ssot_invalid_state_and_missing_session(db):
    from backend.services.cart_picking_lifecycle_service import (
        InvalidCartStateError,
        SessionNotFoundError,
        assert_cart_ready_for_quick_pick,
        set_cart_status,
    )

    cart = _cart(db)
    db.commit()

    set_cart_status(cart, CartStatus.READY_FOR_PACKING)
    db.commit()
    with pytest.raises(InvalidCartStateError) as ei:
        assert_cart_ready_for_quick_pick(db, cart)
    assert ei.value.code == "InvalidCartState"

    set_cart_status(cart, CartStatus.PICKING)
    cart.current_session_id = None
    db.commit()
    with pytest.raises(SessionNotFoundError) as es:
        assert_cart_ready_for_quick_pick(db, cart)
    assert es.value.code == "SessionNotFound"
