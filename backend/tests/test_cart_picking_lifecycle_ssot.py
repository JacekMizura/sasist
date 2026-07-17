"""
SSOT CartLifecycleService — nowy model:
AVAILABLE → claim → ASSIGNED → startPicking(skan) → PICKING → finish → READY_FOR_PACKING
→ startPacking → PACKING → finishPacking → AVAILABLE

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
from backend.services.cart_capacity_service import CartCapacityExceeded
from backend.services.cart_picking_lifecycle_service import (
    InvalidCartStateError,
    InvalidCartTransitionError,
    SessionNotFoundError,
    assert_cart_ready_for_quick_pick,
    cancel_picking,
    claim_cart,
    finish_packing,
    finish_picking,
    get_cart_status,
    release_cart,
    start_packing,
    start_picking,
)
from backend.services.order_fulfillment_state import PACKING, PICKING
from backend.services.wms_audit_service import (
    WmsOperationSessionNotFound,
    touch_wms_operation_session,
)


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


def _cart(db, *, max_orders=None, capacity_mode="volume", code: str = "CART-001") -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="WOZ-001",
        code=code,
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_mode=capacity_mode,
        max_orders=max_orders,
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


def test_claim_has_no_orders_or_session(db):
    cart = _cart(db)
    o1 = _order(db, number="A-1")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()

    assert get_cart_status(cart) == CartStatus.ASSIGNED
    assert cart.assigned_user_id == 7
    assert cart.current_session_id is None
    db.refresh(o1)
    assert o1.cart_id is None


def test_full_lifecycle_scan_assigns_orders(db):
    cart = _cart(db)
    o1 = _order(db, number="A-1")
    o2 = _order(db, number="A-2")
    db.commit()

    claim_cart(db, cart=cart, operator_user_id=7)
    db.commit()
    assert o1.cart_id is None

    sess = start_picking(
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
        assert (o.fulfillment_state or "").upper() == PICKING

    finish_picking(db, cart=cart, orders=[o1, o2], operator_user_id=7)
    db.commit()
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING
    assert cart.assigned_user_id == 7
    assert cart.current_session_id is None
    assert o1.cart_id == cart.id

    start_packing(db, cart=cart, operator_user_id=99)
    db.commit()
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.PACKING
    assert cart.assigned_user_id is None
    assert getattr(cart, "packing_user_id", None) == 99

    released = finish_packing(db, cart=cart, packed_order_id=int(o1.id))
    db.commit()
    assert released is False
    assert o2.cart_id == cart.id

    released2 = finish_packing(db, cart=cart, packed_order_id=int(o2.id))
    db.commit()
    assert released2 is True
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert cart.assigned_user_id is None
    assert cart.current_session_id is None
    assert getattr(cart, "packing_user_id", None) is None


def test_capacity_truncate_on_start_picking(db):
    cart = _cart(db, max_orders=2, capacity_mode="orders")
    orders = [_order(db, number=f"C-{i}") for i in range(5)]
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    sess = start_picking(db, cart=cart, orders=orders, operator_user_id=1, on_capacity="truncate")
    db.commit()
    on_cart = db.query(Order).filter(Order.cart_id == cart.id).count()
    assert on_cart == 2
    assert get_cart_status(cart) == CartStatus.PICKING
    assert sess is not None


def test_capacity_error_on_start_picking(db):
    cart = _cart(db, max_orders=1, capacity_mode="orders")
    o1 = _order(db, number="E-1")
    o2 = _order(db, number="E-2")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    with pytest.raises(CartCapacityExceeded):
        start_picking(db, cart=cart, orders=[o1, o2], operator_user_id=1, on_capacity="error")


def test_cancel_only_assigned_or_picking(db):
    cart = _cart(db)
    o1 = _order(db, number="B-1")
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=3)
    start_picking(db, cart=cart, orders=[o1], operator_user_id=3)
    db.commit()

    out = cancel_picking(db, cart_id=int(cart.id), tenant_id=1, warehouse_id=1, operator_user_id=3)
    db.commit()
    db.refresh(o1)
    assert out["cart_status"] == CartStatus.AVAILABLE.value
    assert o1.cart_id is None

    # READY_FOR_PACKING cannot cancel
    cart2 = _cart(db, code="CART-002")
    o2 = _order(db, number="B-2")
    db.commit()
    claim_cart(db, cart=cart2, operator_user_id=3)
    start_picking(db, cart=cart2, orders=[o2], operator_user_id=3)
    finish_picking(db, cart=cart2, orders=[o2])
    db.commit()
    with pytest.raises(InvalidCartTransitionError):
        cancel_picking(db, cart_id=int(cart2.id), tenant_id=1, warehouse_id=1)


def test_touch_never_creates_session(db):
    with pytest.raises(WmsOperationSessionNotFound):
        touch_wms_operation_session(
            db,
            tenant_id=1,
            warehouse_id=1,
            session_kind="picking_active",
            operator_user_id=7,
            cart_id=1,
        )


def test_quick_pick_requires_picking(db):
    cart = _cart(db)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    db.commit()
    with pytest.raises(InvalidCartStateError):
        assert_cart_ready_for_quick_pick(db, cart)

    o1 = _order(db, number="Q-1")
    start_picking(db, cart=cart, orders=[o1], operator_user_id=1)
    db.commit()
    sess = assert_cart_ready_for_quick_pick(db, cart)
    assert sess is not None


def test_ensure_picking_session_forbidden(db):
    from backend.services.cart_picking_lifecycle_service import (
        CartLifecycleError,
        ensure_picking_session_for_cart,
    )

    cart = _cart(db)
    o1 = _order(db, number="X-1")
    db.commit()
    with pytest.raises(CartLifecycleError) as ei:
        ensure_picking_session_for_cart(db, cart=cart, orders=[o1], operator_user_id=1)
    assert ei.value.code == "legacy_ensure_forbidden"
