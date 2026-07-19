"""
Product context vs pending — MULTI basket destination without prior EAN.

CASE 1: click context + S-1-2 → series, Pick=0 → EAN → +1
CASE 2: EAN pending + S-1-2 → Pick=+1 (no second EAN)
CASE 3/4: S-1-1 / S-1-2 selection (not FIFO)
CASE 5/6: wrong basket zero mutation
CASE 7: series switch qty=0 then EAN +1
CASE 8: EAN before basket on detail → pending → basket +1
CASE 9/10: context / pending survive as SSOT inputs

  python -m pytest backend/tests/test_wms_basket_put_product_context_destination.py -q
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
    session.add(Product(id=192, tenant_id=1, name="X", sku="ST-003", ean="5905450181208"))
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
        # #1234 → S-1-1 rem 8; #1235 → S-1-2 rem 1 (live case)
        for oid, bid, qty in ((1234, 10, 8.0), (1235, 11, 1.0)):
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


def _scan_ean(db, env, *, product_id=192):
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


def _confirm(db, env, basket: str, *, product_id=None, location_id=None):
    return confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan=basket,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
        product_id=product_id,
        location_id=location_id,
    )


def test_case1_click_basket_then_ean(db, env):
    env["add_orders"]()
    r = _confirm(db, env, "brck1-B02", product_id=192, location_id=100)
    assert r.phase == "SERIES_ACTIVATED"
    assert float(r.quantity_put) == 0
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"]) is None
    series = put_state.get_active_series(env["sess"])
    assert series["basket_label"] == "S-1-2"
    assert int(series["order_id"]) == 1235

    r2 = _scan_ean(db, env)
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]


def test_case2_ean_pending_then_basket_plus_one(db, env):
    env["add_orders"]()
    r0 = _scan_ean(db, env)
    assert r0.phase == "AWAITING_BASKET_CONFIRMATION"
    assert put_state.get_pending(env["sess"]) is not None
    r = _confirm(db, env, "brck1-B02", product_id=192, location_id=100)
    assert r.phase == "PUT_CONFIRMED"
    assert float(r.quantity_put) == 1
    assert env["pick_calls"] == [(1.0, 1235)]
    assert put_state.get_pending(env["sess"]) is None
    assert put_state.get_active_series(env["sess"])["basket_label"] == "S-1-2"


def test_case3_click_s11_then_ean(db, env):
    env["add_orders"]()
    r = _confirm(db, env, "brck1-B01", product_id=192, location_id=100)
    assert r.phase == "SERIES_ACTIVATED"
    assert int(r.order_id) == 1234
    assert float(r.quantity_put) == 0
    _scan_ean(db, env)
    assert env["pick_calls"] == [(1.0, 1234)]


def test_case4_click_s12_not_fifo_s11(db, env):
    env["add_orders"]()
    r = _confirm(db, env, "brck1-B02", product_id=192, location_id=100)
    assert int(r.order_id) == 1235
    assert r.active_series["basket_label"] == "S-1-2"
    _scan_ean(db, env)
    assert env["pick_calls"] == [(1.0, 1235)]
    assert env["pick_calls"][0][1] != 1234


def test_case5_click_wrong_basket_zero_mutation(db, env):
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B03", product_id=192, location_id=100)
    assert cm.value.code == ec.BASKET_EMPTY
    assert env["pick_calls"] == []
    assert put_state.get_active_series(env["sess"]) is None
    assert put_state.get_pending(env["sess"]) is None


def test_case6_pending_wrong_basket_survives(db, env):
    env["add_orders"]()
    _scan_ean(db, env)
    key = put_state.get_pending(env["sess"])["idempotency_key"]
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B03", product_id=192, location_id=100)
    assert cm.value.code == ec.BASKET_EMPTY
    assert env["pick_calls"] == []
    assert put_state.get_pending(env["sess"])["idempotency_key"] == key


def test_case7_series_switch_qty0_then_ean(db, env):
    env["add_orders"]()
    _confirm(db, env, "brck1-B01", product_id=192, location_id=100)
    _scan_ean(db, env)
    assert env["pick_calls"] == [(1.0, 1234)]
    sw = _confirm(db, env, "brck1-B02", product_id=192, location_id=100)
    assert sw.phase == "SERIES_DESTINATION_SWITCHED"
    assert float(sw.quantity_put) == 0
    assert len(env["pick_calls"]) == 1
    assert put_state.get_active_series(env["sess"])["basket_label"] == "S-1-2"
    _scan_ean(db, env)
    assert env["pick_calls"] == [(1.0, 1234), (1.0, 1235)]


def test_case8_ean_before_basket_on_detail(db, env):
    """Click-equivalent: EAN first creates pending, then basket +1."""
    env["add_orders"]()
    assert put_state.get_pending(env["sess"]) is None
    r = _scan_ean(db, env)
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert float(put_state.get_pending(env["sess"])["quantity"]) == 1
    r2 = _confirm(db, env, "brck1-B02", product_id=192, location_id=100)
    assert r2.phase == "PUT_CONFIRMED"
    assert float(r2.quantity_put) == 1


def test_case9_basket_without_ean_uses_product_context(db, env):
    """Refresh after click: product_id from route is enough — no prior EAN/pending."""
    env["add_orders"]()
    assert put_state.get_pending(env["sess"]) is None
    assert put_state.get_active_series(env["sess"]) is None
    r = _confirm(db, env, "brck1-B02", product_id=192, location_id=100)
    assert r.phase == "SERIES_ACTIVATED"
    assert float(r.quantity_put) == 0


def test_case10_pending_ssot_after_ean_survives_confirm_with_context(db, env):
    env["add_orders"]()
    _scan_ean(db, env)
    assert put_state.get_pending(env["sess"]) is not None
    r = _confirm(db, env, "brck1-B01", product_id=192, location_id=100)
    assert r.phase == "PUT_CONFIRMED"
    assert float(r.quantity_put) == 1
    assert int(r.order_id) == 1234


def test_no_product_context_still_rejects(db, env):
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B02")
    assert cm.value.code == ec.EXPECTED_PRODUCT_SCAN
    assert env["pick_calls"] == []


def test_mismatch_product_on_context(db, env):
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "brck1-B02", product_id=193, location_id=100)
    assert cm.value.code == "BASKET_PRODUCT_MISMATCH"
    assert env["pick_calls"] == []
    assert put_state.get_active_series(env["sess"]) is None
