"""
Regression: same SKU on S-1-1 + S-1-2 — confirm S-1-2 must not 409 from foreign series.

ROOT CAUSE (prod symptom):
  active_series for *another* product_id was exposed on product detail → UI showed
  SERIA S-1-1 with progress 0/N → basket scan S-1-2 treated as series switch →
  BASKET_PRODUCT_MISMATCH 409 (series.product_id ≠ SKU on S-1-2 order).

  python -m pytest backend/tests/test_wms_basket_put_multi_sku_s12_regression.py -q
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
from backend.services.wms_basket_put.scan_service import (
    BasketPutError,
    confirm_basket_put,
    get_basket_put_ui_state,
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
    session.add(Product(id=192, tenant_id=1, name="Sznurowadla CAT", sku="CAT150", ean="5905450181208"))
    session.add(Product(id=191, tenant_id=1, name="Other SKU", sku="OTH", ean="111"))
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
        name="MULTI-2",
        code="CART-0002",
        type=CartType.MULTI,
        status="PICKING",
    )
    db.add(cart)
    b1 = CartBasket(
        id=10,
        cart_id=2,
        warehouse_id=1,
        row=0,
        column=0,
        name="S-1-1",
        barcode="CART-2-B01",
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
        barcode="CART-2-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    db.add_all([b1, b2])
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

    def add_order(oid: int, basket_id: int, product_id: int = 192, qty: float = 5):
        o = Order(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            number=str(oid),
            status="PICKING",
            fulfillment_state="PICKING",
            cart_id=2,
            basket_id=basket_id,
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
                product_id=product_id,
                quantity=qty,
                unit_price=1.0,
            )
        )
        db.get(CartBasket, basket_id).order_id = oid
        db.commit()

    return {
        "cart": cart,
        "sess": sess,
        "pick_calls": pick_calls,
        "picked": picked,
        "record_pick_fn": record_pick_fn,
        "add_order": add_order,
    }


def _scan(db, env, *, product_id=192, order_ids=(1234, 1235)):
    return handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=list(order_ids),
        product_id=product_id,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )


def _confirm(db, env, basket: str, *, order_ids=(1234, 1235)):
    return confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan=basket,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=list(order_ids),
    )


def test_case1_ean_then_s12_pick_only_order_b(db, env):
    env["add_order"](1234, 10, qty=4)
    env["add_order"](1235, 11, qty=5)
    r1 = _scan(db, env)
    assert r1.phase == "AWAITING_BASKET_CONFIRMATION"
    assert env["pick_calls"] == []
    assert "order_item_id" not in (r1.pending or {})
    labels = {b["basket_label"] for b in (r1.eligible_baskets or [])}
    assert labels == {"S-1-1", "S-1-2"}
    r2 = _confirm(db, env, "S-1-2")
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]
    assert int(r2.active_series["basket_id"]) == 11


def test_case2_ean_then_s11_pick_only_order_a(db, env):
    env["add_order"](1234, 10, qty=4)
    env["add_order"](1235, 11, qty=5)
    _scan(db, env)
    r2 = _confirm(db, env, "S-1-1")
    assert env["pick_calls"] == [(1.0, 1234)]
    assert int(r2.active_series["basket_id"]) == 10


def test_case3_back_reopen_unbound_no_auto_s11(db, env):
    env["add_order"](1234, 10, qty=4)
    env["add_order"](1235, 11, qty=5)
    _scan(db, env)
    ui = get_basket_put_ui_state(
        db, cart=env["cart"], product_id=192, order_ids=[1234, 1235], sanitize=True
    )
    assert ui["pending"] is not None
    assert ui["active_series"] is None
    assert int(ui["pending"]["product_id"]) == 192


def test_case4_foreign_series_hidden_and_does_not_force_s11(db, env):
    """Exact prod bug: series for other SKU must not appear on product 192 detail."""
    env["add_order"](1234, 10, product_id=192, qty=9)
    env["add_order"](1235, 11, product_id=192, qty=9)
    # Leftover series from a *different* product on S-1-1
    put_state.set_active_series(
        db,
        env["sess"],
        {
            "operator_user_id": 1,
            "product_id": 191,
            "order_id": 1234,
            "order_item_id": 12340,
            "basket_id": 10,
            "basket_label": "S-1-1",
            "location_id": 100,
            "activated_at": "Z",
        },
    )
    ui = get_basket_put_ui_state(
        db, cart=env["cart"], product_id=192, order_ids=[1234, 1235], sanitize=True
    )
    assert ui["active_series"] is None
    assert ui["pending"] is None

    # Without product filter series still sits in metadata. Confirm S-1-2 must not
    # invent a Pick via foreign series — stale series for product 191 (no open line)
    # is cleared → NO_PENDING_PUT (was BASKET_PRODUCT_MISMATCH before sanitize).
    raw = get_basket_put_ui_state(db, cart=env["cart"], sanitize=False)
    assert raw["active_series"] is not None
    assert int(raw["active_series"]["product_id"]) == 191
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, env, "S-1-2")
    assert cm.value.code == "NO_PENDING_PUT"
    assert env["pick_calls"] == []

    # Correct entry: product scan → unbound pending → S-1-2 OK
    r = _scan(db, env)
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert put_state.get_active_series(env["sess"]) is None
    r2 = _confirm(db, env, "S-1-2")
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]


def test_case5_valid_series_switch_s11_to_s12_qty0(db, env):
    env["add_order"](1234, 10, qty=4)
    env["add_order"](1235, 11, qty=5)
    _scan(db, env)
    _confirm(db, env, "S-1-1")
    assert len(env["pick_calls"]) == 1
    sw = _confirm(db, env, "S-1-2")
    assert sw.phase == "SERIES_DESTINATION_SWITCHED"
    assert float(sw.quantity_put) == 0
    assert len(env["pick_calls"]) == 1
    nxt = _scan(db, env)
    assert nxt.phase == "PUT_CONFIRMED"
    assert int(nxt.order_id) == 1235
    assert [c[1] for c in env["pick_calls"]] == [1234, 1235]


def test_case6_pending_confirm_s12_is_pick_not_switch(db, env):
    env["add_order"](1234, 10, qty=4)
    env["add_order"](1235, 11, qty=5)
    _scan(db, env)
    assert put_state.get_pending(env["sess"]) is not None
    r = _confirm(db, env, "S-1-2")
    assert r.phase == "PUT_CONFIRMED"
    assert float(r.quantity_put) == 1
    assert env["pick_calls"] == [(1.0, 1235)]


def test_case7_reopen_after_s12_shows_series_s12_not_fifo_s11(db, env):
    env["add_order"](1234, 10, qty=4)
    env["add_order"](1235, 11, qty=5)
    _scan(db, env)
    _confirm(db, env, "S-1-2")
    ui = get_basket_put_ui_state(
        db, cart=env["cart"], product_id=192, order_ids=[1234, 1235], sanitize=True
    )
    assert ui["pending"] is None
    assert ui["active_series"] is not None
    assert ui["active_series"]["basket_label"] == "S-1-2"
    assert int(ui["active_series"]["order_id"]) == 1235


def test_stale_same_product_series_cleared_when_line_gone(db, env):
    env["add_order"](1234, 10, qty=1)
    env["add_order"](1235, 11, qty=5)
    _scan(db, env)
    _confirm(db, env, "S-1-1")
    # Exhaust line via counter
    env["picked"][12340] = 1.0
    ui = get_basket_put_ui_state(
        db, cart=env["cart"], product_id=192, order_ids=[1234, 1235], sanitize=True
    )
    assert ui["active_series"] is None
    assert put_state.get_active_series(env["sess"]) is None
