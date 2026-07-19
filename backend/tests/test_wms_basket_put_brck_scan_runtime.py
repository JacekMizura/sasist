"""
Production runtime path: EAN → pending → brck1-B0x basket confirm.

Mirrors Scanner Helper codes (barcode=brck1-B01/B02, label=S-1-1/S-1-2)
and FE routing decisions in multiPickingScanRoute.ts.

  python -m pytest backend/tests/test_wms_basket_put_brck_scan_runtime.py -q
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
from backend.services.wms_basket_put.basket_match import basket_scan_matches, primary_basket_label
from backend.services.wms_basket_put.scan_service import (
    BasketPutError,
    confirm_basket_put,
    get_basket_put_ui_state,
    handle_product_scan_for_baskets,
)
from backend.services.wms_basket_put import state as put_state


EAN = "5905450181208"
PRODUCT_ID = 192


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
    session.add(
        Product(id=PRODUCT_ID, tenant_id=1, name="Sznurowadla CAT", sku="CAT150", ean=EAN)
    )
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
    # Production shape: label S-1-x ≠ scan barcode brck1-B0x
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
                    product_id=PRODUCT_ID,
                    quantity=qty,
                    unit_price=1.0,
                )
            )
            db.get(CartBasket, bid).order_id = oid
        db.commit()

    return {
        "cart": cart,
        "sess": sess,
        "b1": b1,
        "b2": b2,
        "pick_calls": pick_calls,
        "picked": picked,
        "record_pick_fn": record_pick_fn,
        "add_orders": add_orders,
    }


def test_basket_codes_resolve_by_barcode_not_label(env):
    assert primary_basket_label(env["b1"]) == "S-1-1"
    assert primary_basket_label(env["b2"]) == "S-1-2"
    assert basket_scan_matches(env["b1"], "brck1-B01")
    assert basket_scan_matches(env["b2"], "brck1-B02")
    assert not basket_scan_matches(env["b1"], "brck1-B02")
    # Label also accepted, but production Scanner Helper sends barcode.
    assert basket_scan_matches(env["b2"], "S-1-2")


def test_case_ean_then_brck1_b02_pick_only_order_b(db, env):
    env["add_orders"]()
    # ACTION 1: PRODUCT_SCAN (list/detail quick-pick gate)
    r1 = handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=PRODUCT_ID,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )
    assert r1.phase == "AWAITING_BASKET_CONFIRMATION"
    assert env["pick_calls"] == []
    pending = put_state.get_pending(env["sess"])
    assert pending is not None
    assert int(pending["product_id"]) == PRODUCT_ID
    assert float(pending["quantity"]) == 1.0
    labels = {b["basket_label"] for b in (pending.get("eligible_baskets") or [])}
    assert labels == {"S-1-1", "S-1-2"}

    ui = get_basket_put_ui_state(
        db, cart=env["cart"], product_id=PRODUCT_ID, order_ids=[1234, 1235], sanitize=True
    )
    assert ui["pending"] is not None
    assert ui["active_series"] is None

    # ACTION 2: Scanner Helper sends brck1-B02 (not S-1-2)
    r2 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
    )
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]
    assert put_state.get_pending(env["sess"]) is None
    series = put_state.get_active_series(env["sess"])
    assert int(series["product_id"]) == PRODUCT_ID
    assert int(series["basket_id"]) == 11
    assert int(series["order_id"]) == 1235
    assert series["basket_label"] == "S-1-2"


def test_case_ean_then_brck1_b01_pick_only_order_a(db, env):
    env["add_orders"]()
    handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=PRODUCT_ID,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
    )
    r2 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B01",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
    )
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1234)]
    series = put_state.get_active_series(env["sess"])
    assert int(series["basket_id"]) == 10
    assert int(series["order_id"]) == 1234


def test_basket_scan_without_pending_does_not_invent_pick(db, env):
    """Product context + basket → QUANTITY_REQUIRED (Pick=0) until quantity commit."""
    env["add_orders"]()
    with pytest.raises(BasketPutError) as cm:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=[1234, 1235],
        )
    assert cm.value.code == "EXPECTED_PRODUCT_SCAN"
    assert env["pick_calls"] == []

    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
        product_id=192,
        location_id=100,
    )
    assert r.phase == "QUANTITY_REQUIRED"
    assert float(r.quantity_put) == 0
    assert env["pick_calls"] == []

    r2 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=[1234, 1235],
        product_id=192,
        location_id=100,
        quantity=1,
    )
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(1.0, 1235)]
