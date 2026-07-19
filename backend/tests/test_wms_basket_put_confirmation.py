"""
Basket put confirmation SSOT — CASE 1–11 for MULTI / baskets picking.

  python -m pytest backend/tests/test_wms_basket_put_confirmation.py -q
"""

from __future__ import annotations

from datetime import datetime

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
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.wms_basket_put.basket_match import basket_scan_matches, primary_basket_label
from backend.services.wms_basket_put.scan_service import (
    BasketPutError,
    clear_basket_put_state,
    confirm_basket_put,
    handle_product_scan_for_baskets,
)
from backend.services.wms_basket_put import state as put_state


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=10, tenant_id=1, name="P", sku="P10", ean="5905450181192"))
    session.add(Product(id=11, tenant_id=1, name="Y", sku="P11", ean="5905450181193"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def cart_env(db, monkeypatch):
    now = datetime.utcnow()
    cart = Cart(
        id=50,
        tenant_id=1,
        warehouse_id=1,
        name="MULTI-50",
        code="CART-0050",
        type=CartType.MULTI,
        status="PICKING",
    )
    db.add(cart)
    b1 = CartBasket(
        id=1,
        cart_id=50,
        warehouse_id=1,
        row=0,
        column=0,
        name="S-1-1",
        barcode="CART-0050-B01",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    b2 = CartBasket(
        id=2,
        cart_id=50,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="CART-0050-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    db.add(b1)
    db.add(b2)
    sess = WmsOperationSession(
        id=900,
        tenant_id=1,
        warehouse_id=1,
        cart_id=50,
        session_kind="picking_active",
        operator_user_id=1,
        started_at=now,
        last_activity_at=now,
        metadata_json="{}",
    )
    db.add(sess)
    cart.current_session_id = 900
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        lambda db, oi_id, cid: 0.0,
    )

    pick_calls: list[tuple[float, int | None]] = []

    def record_pick_fn(*, quantity: float, fixed_order_id: int | None = None):
        pick_calls.append((float(quantity), fixed_order_id))
        oid = int(fixed_order_id or 0)
        return oid, oid * 10

    def add_order(oid: int, basket_id: int, product_id: int = 10, qty: float = 1) -> Order:
        o = Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=f"O{oid}",
            status="PICKING",
            fulfillment_state="PICKING",
            cart_id=50,
            basket_id=basket_id,
            picking_session_id=900,
            total_volume_dm3=1.0,
            created_at=now,
            picking_started_at=now,
        )
        db.add(o)
        db.flush()
        db.add(
            OrderItem(
                id=oid * 10,
                order_id=oid,
                product_id=product_id,
                quantity=qty,
                unit_price=1.0,
            )
        )
        bask = db.get(CartBasket, basket_id)
        if bask:
            bask.order_id = oid
        db.commit()
        return o

    return {
        "cart": cart,
        "sess": sess,
        "b1": b1,
        "b2": b2,
        "pick_calls": pick_calls,
        "record_pick_fn": record_pick_fn,
        "add_order": add_order,
    }


def test_case1_product_then_basket_increments(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    r1 = handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    assert r1.phase == "AWAITING_BASKET_CONFIRMATION"
    assert cart_env["pick_calls"] == []
    assert put_state.get_pending(cart_env["sess"]) is not None

    r2 = confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    assert r2.phase == "PUT_CONFIRMED"
    assert len(cart_env["pick_calls"]) == 1
    assert put_state.get_pending(cart_env["sess"]) is None
    assert put_state.get_active_series(cart_env["sess"]) is not None


def test_case2_wrong_basket_keeps_pending(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    with pytest.raises(BasketPutError) as cm:
        confirm_basket_put(
            db,
            cart=cart_env["cart"],
            basket_scan="S-1-2",
            operator_user_id=1,
            record_pick_fn=cart_env["record_pick_fn"],
        )
    assert cm.value.code == "BASKET_MISMATCH"
    assert cart_env["pick_calls"] == []
    assert put_state.get_pending(cart_env["sess"]) is not None


def test_case3_product_again_while_pending(db, cart_env):
    cart_env["add_order"](1224, 1, qty=5)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    with pytest.raises(BasketPutError) as cm:
        handle_product_scan_for_baskets(
            db,
            cart=cart_env["cart"],
            order_ids=[1224],
            product_id=10,
            location_id=100,
            quantity=1,
            operator_user_id=1,
            record_pick_fn=cart_env["record_pick_fn"],
        )
    assert cm.value.code == "AWAITING_BASKET_CONFIRMATION"
    assert cart_env["pick_calls"] == []


def test_case4_series_twenty_units_one_basket_scan(db, cart_env):
    cart_env["add_order"](1224, 1, qty=20)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    assert len(cart_env["pick_calls"]) == 1
    for _ in range(19):
        r = handle_product_scan_for_baskets(
            db,
            cart=cart_env["cart"],
            order_ids=[1224],
            product_id=10,
            location_id=100,
            quantity=1,
            operator_user_id=1,
            record_pick_fn=cart_env["record_pick_fn"],
        )
        assert r.phase == "PUT_CONFIRMED"
    assert len(cart_env["pick_calls"]) == 20


def test_case5_destination_change_resets_series(db, cart_env):
    cart_env["add_order"](1224, 1, product_id=10, qty=2)
    cart_env["add_order"](1225, 2, product_id=11, qty=2)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    r = handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1225],
        product_id=11,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert r.expected_basket_label == "S-1-2"
    assert put_state.get_active_series(cart_env["sess"]) is None


def test_case6_same_sku_two_baskets(db, cart_env):
    cart_env["add_order"](1224, 1, product_id=10, qty=5)
    cart_env["add_order"](1225, 2, product_id=10, qty=5)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224, 1225],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    series = put_state.get_active_series(cart_env["sess"])
    assert int(series["basket_id"]) == 1
    assert int(series["order_id"]) == 1224

    oi = db.get(OrderItem, 12240)
    oi.wms_picking_line_status = "picked"
    db.commit()

    r = handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224, 1225],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert r.expected_basket_label == "S-1-2"


def test_case7_refresh_pending_survives(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    db.commit()
    db.expire_all()
    sess2 = db.get(WmsOperationSession, 900)
    pending = put_state.get_pending(sess2)
    assert pending is not None
    assert pending["expected_basket_label"] == "S-1-1"
    assert cart_env["pick_calls"] == []


def test_case8_double_confirm_no_pending(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    with pytest.raises(BasketPutError) as cm:
        confirm_basket_put(
            db,
            cart=cart_env["cart"],
            basket_scan="S-1-1",
            operator_user_id=1,
            record_pick_fn=cart_env["record_pick_fn"],
        )
    assert cm.value.code == "NO_PENDING_PUT"
    assert len(cart_env["pick_calls"]) == 1


def test_case9_clear_on_shortage(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    clear_basket_put_state(db, session=cart_env["sess"], reason="shortage")
    assert put_state.get_pending(cart_env["sess"]) is None


def test_case10_operator_isolation(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=[1224],
        product_id=10,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )
    with pytest.raises(BasketPutError) as cm:
        confirm_basket_put(
            db,
            cart=cart_env["cart"],
            basket_scan="S-1-1",
            operator_user_id=2,
            record_pick_fn=cart_env["record_pick_fn"],
        )
    assert cm.value.code == "BASKET_PUT_OWNED_BY_OTHER"
    assert cart_env["pick_calls"] == []


def test_case11_basket_label_match(db, cart_env):
    assert basket_scan_matches(cart_env["b1"], "S-1-1")
    assert basket_scan_matches(cart_env["b1"], "CART-0050-B01")
    assert primary_basket_label(cart_env["b1"]) == "S-1-1"
