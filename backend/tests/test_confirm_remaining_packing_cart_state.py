"""
Regression: confirm-remaining / bootstrap must not silently use a PACKING cart.

  python -m pytest backend/tests/test_confirm_remaining_packing_cart_state.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartStatus, CartType
from backend.models.fulfillment_event import FulfillmentEvent
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import (
    InvalidCartStateError,
    assert_cart_ready_for_quick_pick,
)
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_picking_confirm_remaining_service import confirm_remaining_product_picks
from backend.services.wms_picking_product_list_service import bootstrap_start_picking_if_needed
from backend.services.wms_user_messages import from_cart_lifecycle_error


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Location,
        Inventory,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        Pick,
        WmsOperationSession,
        FulfillmentEvent,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=False))
    session.add(Product(id=10, tenant_id=1, name="P", sku="P", ean="590"))
    session.add(Location(id=100, warehouse_id=1, name="A10-A-1", type="pick", is_active=True))
    session.commit()

    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.emit_wms_picked_item",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.emit_wms_picking_started",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.cart_picking_lifecycle_service.notify_first_product_confirmed",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.inventory_count.inventory_movement_guard_service.locked_location_ids_for_picking",
        lambda *a, **k: set(),
    )
    try:
        yield session
    finally:
        session.close()


def _packing_cart(db, *, status: str = CartStatus.PACKING.value) -> Cart:
    cart = Cart(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        name="BULK-1",
        code="BULK-1",
        type=CartType.BULK,
        status=status,
        assigned_user_id=1,
    )
    db.add(cart)
    order = Order(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        number="1001",
        cart_id=1,
        status="packing",
        order_ui_status_id=6,
    )
    db.add(order)
    db.add(OrderItem(id=1, order_id=1, product_id=10, quantity=2.0))
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=10,
            location_id=100,
            quantity=10.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()
    return cart


def test_bootstrap_rejects_packing_cart(db):
    _packing_cart(db, status=CartStatus.PACKING.value)
    with pytest.raises(InvalidCartStateError) as ei:
        bootstrap_start_picking_if_needed(
            db,
            tenant_id=1,
            warehouse_id=1,
            cart_id=1,
            source_status_id=6,
            order_type="all",
            operator_user_id=1,
        )
    assert ei.value.cart_status == CartStatus.PACKING.value
    msg = from_cart_lifecycle_error(
        ei.value,
        extra={"action": "start_picking", "current": ei.value.cart_status},
    )
    assert msg.code == "WMS_INVALID_CART_STATE"
    assert "pakowan" in msg.message.lower()
    assert "PICKING" not in msg.message
    assert "PACKING" not in msg.message
    assert "startPicking" not in msg.message
    assert "startPicking" not in (msg.suggested_action or "")


def test_bootstrap_rejects_ready_for_packing_cart(db):
    _packing_cart(db, status=CartStatus.READY_FOR_PACKING.value)
    with pytest.raises(InvalidCartStateError) as ei:
        bootstrap_start_picking_if_needed(
            db,
            tenant_id=1,
            warehouse_id=1,
            cart_id=1,
            source_status_id=6,
            order_type="all",
            operator_user_id=1,
        )
    assert ei.value.cart_status == CartStatus.READY_FOR_PACKING.value
    msg = from_cart_lifecycle_error(
        ei.value,
        extra={"action": "start_picking", "current": ei.value.cart_status},
    )
    assert "pakowan" in msg.message.lower()
    assert "PICKING" not in msg.message


def test_quick_pick_guard_rejects_packing_cart_polish_message(db):
    """Screen bug path: confirm-remaining → assert_cart_ready_for_quick_pick on PACKING cart."""
    cart = _packing_cart(db, status=CartStatus.PACKING.value)
    with pytest.raises(InvalidCartStateError) as ei:
        assert_cart_ready_for_quick_pick(db, cart)
    assert ei.value.cart_status == CartStatus.PACKING.value
    raw = str(ei.value.message)
    assert "PICKING" not in raw
    assert "startPicking" not in raw
    mapped = from_cart_lifecycle_error(
        ei.value,
        extra={"action": "confirm_remaining", "current": ei.value.cart_status},
    )
    assert mapped.code == "WMS_INVALID_CART_STATE"
    assert "pakowan" in mapped.message.lower()
    assert "PICKING" not in mapped.message
    assert "PACKING" not in mapped.message
    assert "startPicking" not in mapped.message


def test_confirm_remaining_ok_when_cart_picking_already_complete(db):
    now = datetime.utcnow()
    cart = Cart(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        name="BULK-1",
        code="BULK-1",
        type=CartType.BULK,
        status=CartStatus.PICKING.value,
        assigned_user_id=1,
    )
    db.add(cart)
    sess = WmsOperationSession(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        cart_id=1,
        session_kind="picking_active",
        operator_user_id=1,
        started_at=now,
        last_activity_at=now,
        metadata_json="{}",
    )
    db.add(sess)
    cart.current_session_id = 1
    db.add(
        Order(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            number="1001",
            cart_id=1,
            status="picking",
            picking_session_id=1,
            picking_started_at=now,
            order_ui_status_id=6,
        )
    )
    db.add(OrderItem(id=1, order_id=1, product_id=10, quantity=0.0))
    db.commit()

    out = confirm_remaining_product_picks(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        product_id=10,
        cart_id=1,
        operator_user_id=1,
    )
    assert out["already_complete"] is True
