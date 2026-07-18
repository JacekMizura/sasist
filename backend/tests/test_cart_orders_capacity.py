"""
Walidacja pojemności wózka (LIMIT_ORDERS) — CartCapacityEngine SSOT.

  python -m pytest backend/tests/test_cart_orders_capacity.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.picking_assignment import PickingAssignmentConfig
from backend.services.cart_capacity import CartCapacityEngine, CartCapacityExceeded
from backend.services.picking_assignment_service import PickingAssignmentService


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, Cart, CartBasket, Order, CartLifecycleHistory, CartLifecycleEvent):
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


def _cart(db, *, capacity_orders: int = 2, capacity_strategy: str = "LIMIT_ORDERS") -> Cart:
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
        capacity_strategy=capacity_strategy,
        capacity_orders=capacity_orders,
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


def test_engine_orders_limit_raises_when_exceeded():
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="W",
        code="C",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=2,
    )
    engine = CartCapacityEngine.from_cart(cart, assigned_orders=1, assigned_volume=0)
    assert engine.can_accept(1.0)
    engine.accept(1.0)
    assert not engine.can_accept(1.0)


def test_engine_orders_limit_ok_when_fits():
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="W",
        code="C",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=2,
    )
    engine = CartCapacityEngine.from_cart(cart, assigned_orders=1, assigned_volume=0)
    assert engine.can_accept(5.0)


def test_engine_skips_volume_strategy_for_order_count():
    cart = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="W",
        code="C",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        total_volume=10.0,
        capacity_strategy="LIMIT_VOLUME",
        capacity_orders=None,
    )
    engine = CartCapacityEngine.from_cart(cart, assigned_orders=10, assigned_volume=0)
    assert engine.can_accept(1.0)


def test_legacy_assignment_forbidden(db):
    cart = _cart(db, capacity_orders=2)
    o2 = _order(db, number="B")
    db.commit()
    from backend.services.cart_picking_lifecycle_service import CartLifecycleError

    svc = PickingAssignmentService(db)
    with pytest.raises(CartLifecycleError) as ei:
        svc.assign_orders_to_cart(
            [o2.id],
            cart.id,
            PickingAssignmentConfig(),
            tenant_id=1,
        )
    assert ei.value.code == "legacy_assign_forbidden"


def test_start_picking_capacity_exceeded_error(db):
    from backend.models.wms_operation_session import WmsOperationSession
    from backend.services.cart_picking_lifecycle_service import claim_cart, start_picking

    WmsOperationSession.__table__.create(db.get_bind(), checkfirst=True)

    cart = _cart(db, capacity_strategy="LIMIT_VOLUME")
    cart.capacity_volume = 1.0
    cart.total_volume = 1.0
    o1 = _order(db, number="B")
    o1.total_volume_dm3 = 5.0
    db.add(o1)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=1)
    with pytest.raises(CartCapacityExceeded) as ei:
        start_picking(
            db,
            cart=cart,
            orders=[o1],
            operator_user_id=1,
            on_capacity="error",
        )
    assert ei.value.code == "CART_CAPACITY_EXCEEDED"
    assert ei.value.attempted == 1
