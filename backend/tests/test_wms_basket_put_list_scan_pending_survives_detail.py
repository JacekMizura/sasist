"""
List PRODUCT_SCAN must leave pending readable on product detail GET (STATE B).

Regression for: list EAN → navigate detail → pending=false → basket EXPECTED_PRODUCT_SCAN.

  python -m pytest backend/tests/test_wms_basket_put_list_scan_pending_survives_detail.py -q
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
    session.add(Product(id=192, tenant_id=1, name="X", sku="X", ean="5905450181208"))
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
    db.add(cart)
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
        "backend.services.wms_basket_put.scan_service.find_open_picking_session",
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
        "record_pick_fn": record_pick_fn,
    }


def test_list_product_scan_pending_visible_on_detail_projection(db, env):
    r = handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=192,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert env["pick_calls"] == []
    db.commit()

    # Simulate detail GET projection (product-scoped).
    ui = get_basket_put_ui_state(
        db, cart=env["cart"], product_id=192, order_ids=[1234, 1235], sanitize=True
    )
    assert ui["requires_basket_put"] is True
    assert ui["pending"] is not None
    assert int(ui["pending"]["product_id"]) == 192
    assert float(ui["pending"]["quantity"]) == 1.0
    labels = {b["basket_label"] for b in (ui["pending"].get("eligible_baskets") or [])}
    assert labels == {"S-1-1", "S-1-2"}
    assert ui["active_series"] is None


def test_refresh_keeps_pending_zero_pick(db, env):
    handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=192,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )
    db.commit()
    key = put_state.get_pending(env["sess"])["idempotency_key"]
    for _ in range(3):
        ui = get_basket_put_ui_state(db, cart=env["cart"], product_id=192, sanitize=True)
        assert ui["pending"] is not None
        assert ui["pending"]["idempotency_key"] == key
    assert env["pick_calls"] == []


def test_s12_then_s11_after_list_style_pending(db, env):
    handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=192,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )
    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
    )
    assert r.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]

    # Next product scan unbound for S-1-1
    r2 = handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=192,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )
    assert r2.phase == "AWAITING_BASKET_CONFIRMATION"
    assert env["pick_calls"] == [(1.0, 1235)]
    r3 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B01",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
    )
    assert env["pick_calls"] == [(1.0, 1235), (1.0, 1234)]
