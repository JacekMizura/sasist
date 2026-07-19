"""
Strict MULTI scan state machine — invalid scans: zero mutation + stable codes.

  python -m pytest backend/tests/test_wms_basket_put_scan_state_machine.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.scan_service import (
    BasketPutError,
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
    session.add(Product(id=192, tenant_id=1, name="X", sku="X", ean="5905450181208"))
    session.add(Product(id=193, tenant_id=1, name="Y", sku="Y", ean="5905450189999"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def env(db, monkeypatch):
    now = datetime.utcnow()
    cart = Cart(
        id=2,
        tenant_id=1,
        warehouse_id=1,
        name="brck1",
        code="brck1",
        type=CartType.MULTI,
        status="PICKING",
    )
    other = Cart(
        id=99,
        tenant_id=1,
        warehouse_id=1,
        name="other",
        code="other",
        type=CartType.MULTI,
        status="IDLE",
    )
    db.add_all([cart, other])
    b1 = CartBasket(
        id=10,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=0,
        name="S-1-1",
        barcode="brck1-B01",
        scan_code="brck1-B01",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    b2 = CartBasket(
        id=11,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="brck1-B02",
        scan_code="brck1-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    empty = CartBasket(
        id=12,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=2,
        name="S-1-3",
        barcode="brck1-B03",
        scan_code="brck1-B03",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
        order_id=None,
    )
    foreign = CartBasket(
        id=90,
        cart_id=99,
        warehouse_id=1,
        row=0,
        column=0,
        name="S-9-1",
        barcode="other-B01",
        scan_code="other-B01",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    db.add_all([b1, b2, empty, foreign])
    sess = WmsOperationSession(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        cart_id=2,
        session_kind="picking_active",
        operator_user_id=1,
        started_at=now,
        last_activity_at=now,
        metadata_json="{}",
    )
    db.add(sess)
    cart.current_session_id = 1
    db.commit()

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    picked: dict[int, float] = {}

    def _sum(_db, oi_id, _cid):
        return float(picked.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum,
    )
    pick_calls: list[tuple[float, int]] = []

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
        pick_calls.append((float(quantity), oid))
        picked[oiid] = float(picked.get(oiid, 0.0)) + float(quantity)
        return oid, oiid

    def add_orders():
        for oid, bid, qty in ((1234, 10, 9.0), (1235, 11, 9.0)):
            o = Order(
                id=oid,
                tenant_id=1,
                warehouse_id=1,
                number=str(oid),
                status="PICKING",
                fulfillment_state="PICKING",
                cart_id=2,
                basket_id=bid,
                picking_session_id=1,
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
                    product_id=192,
                    quantity=qty,
                    unit_price=1.0,
                )
            )
            db.get(CartBasket, bid).order_id = oid
        db.commit()

    return {
        "cart": cart,
        "sess": sess,
        "pick_calls": pick_calls,
        "picked": picked,
        "record_pick_fn": record_pick_fn,
        "add_orders": add_orders,
    }


def _scan(db, env, *, product_id=192):
    return handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=product_id,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )


def _confirm(db, env, basket: str):
    return confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan=basket,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
    )


def _assert_zero(env, pending_before, series_before):
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"]) == pending_before
    assert put_state.get_active_series(env["sess"]) == series_before


def test_1_valid_product_creates_pending(db, env):
    env["add_orders"]()
    r = _scan(db, env)
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"]) is not None


def test_5_valid_basket_pick(db, env):
    env["add_orders"]()
    _scan(db, env)
    r = _confirm(db, env, "brck1-B02")
    assert r.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]


def test_6_wrong_basket_zero_mutation(db, env):
    env["add_orders"]()
    _scan(db, env)
    key = put_state.get_pending(env["sess"])["idempotency_key"]
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B03")  # empty → BASKET_EMPTY
    assert cm.value.code == ec.BASKET_EMPTY
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"])["idempotency_key"] == key


def test_7_basket_other_cart(db, env):
    env["add_orders"]()
    _scan(db, env)
    pending = dict(put_state.get_pending(env["sess"]))
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "other-B01")
    assert cm.value.code == ec.BASKET_OTHER_CART
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"])["idempotency_key"] == pending["idempotency_key"]


def test_8_empty_basket(db, env):
    env["add_orders"]()
    _scan(db, env)
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B03")
    assert cm.value.code == ec.BASKET_EMPTY
    assert env["pick_calls"] == []


def test_9_10_product_while_pending(db, env):
    env["add_orders"]()
    _scan(db, env)
    pending = put_state.get_pending(env["sess"])
    with pytest.raises(BasketPutError) as cm:
        _scan(db, env)
    assert cm.value.code == ec.EXPECTED_BASKET_SCAN
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"])["idempotency_key"] == pending["idempotency_key"]


def test_11_unknown_barcode(db, env):
    env["add_orders"]()
    _scan(db, env)
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "ZZZ-UNKNOWN-99")
    assert cm.value.code == ec.BASKET_MISMATCH
    assert env["pick_calls"] == []


def test_12_13_series_ean_and_switch(db, env):
    env["add_orders"]()
    _scan(db, env)
    _confirm(db, env, "brck1-B01")
    assert len(env["pick_calls"]) == 1
    r = _scan(db, env)
    assert r.phase == "PUT_CONFIRMED"
    assert len(env["pick_calls"]) == 2
    sw = _confirm(db, env, "brck1-B02")
    assert sw.phase == "SERIES_DESTINATION_SWITCHED"
    assert float(sw.quantity_put) == 0
    assert len(env["pick_calls"]) == 2


def test_14_wrong_basket_on_series(db, env):
    env["add_orders"]()
    _scan(db, env)
    _confirm(db, env, "brck1-B01")
    n = len(env["pick_calls"])
    series = put_state.get_active_series(env["sess"])
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B03")
    assert cm.value.code in (ec.BASKET_EMPTY, ec.BASKET_PRODUCT_MISMATCH)
    assert len(env["pick_calls"]) == n
    assert put_state.get_active_series(env["sess"]) == series
