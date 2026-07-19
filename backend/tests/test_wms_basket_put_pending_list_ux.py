"""
Pending basket-put list UX + cancel — CASE 1–9.

Does not mutate Pick SSOT. Series ≠ pending.

  python -m pytest backend/tests/test_wms_basket_put_pending_list_ux.py -q
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
    cancel_pending_basket_put,
    confirm_basket_put,
    handle_product_scan_for_baskets,
    project_basket_put_for_product_lines,
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
    session.add(Product(id=10, tenant_id=1, name="SKU X Name", sku="SKU-X", ean="5905450181192"))
    session.add(Product(id=11, tenant_id=1, name="SKU Y Name", sku="SKU-Y", ean="5905450181193"))
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

    def record_pick_fn(
        *,
        quantity: float,
        fixed_order_id: int | None = None,
        scope_order_id: int | None = None,
    ):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        pick_calls.append((float(quantity), oid))
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
        "pick_calls": pick_calls,
        "record_pick_fn": record_pick_fn,
        "add_order": add_order,
    }


def _scan(db, cart_env, *, order_ids, product_id=10):
    return handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=order_ids,
        product_id=product_id,
        location_id=100,
        quantity=1,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )


def _proj(db, cart_env, *, operator_user_id=1):
    return project_basket_put_for_product_lines(
        db,
        cart=cart_env["cart"],
        tenant_id=1,
        operator_user_id=operator_user_id,
    )


def test_case1_pending_visible_on_list_projection(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    _scan(db, cart_env, order_ids=[1234])
    assert cart_env["pick_calls"] == []
    proj = _proj(db, cart_env)
    assert proj["basket_put_pending"] is not None
    assert int(proj["basket_put_pending"]["product_id"]) == 10
    assert proj["basket_put_pending"]["product_name"] == "SKU X Name"
    assert proj["basket_put_pending"]["ean"] == "5905450181192"
    assert float(proj["basket_put_pending"]["quantity"]) == 1.0


def test_case2_resume_uses_existing_pending_no_second_scan(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    r1 = _scan(db, cart_env, order_ids=[1234])
    key = r1.pending["idempotency_key"]
    with pytest.raises(BasketPutError) as cm:
        _scan(db, cart_env, order_ids=[1234])
    assert cm.value.code == "EXPECTED_BASKET_SCAN"
    assert put_state.get_pending(cart_env["sess"])["idempotency_key"] == key
    assert cart_env["pick_calls"] == []
    proj = _proj(db, cart_env)
    assert proj["basket_put_pending"]["idempotency_key"] == key


def test_case3_same_product_scan_while_pending_no_pick(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    _scan(db, cart_env, order_ids=[1234])
    with pytest.raises(BasketPutError) as cm:
        _scan(db, cart_env, order_ids=[1234], product_id=10)
    assert cm.value.code == "EXPECTED_BASKET_SCAN"
    assert cart_env["pick_calls"] == []


def test_case4_other_product_scan_while_pending_blocked(db, cart_env):
    cart_env["add_order"](1234, 1, product_id=10, qty=4)
    cart_env["add_order"](1235, 2, product_id=11, qty=4)
    _scan(db, cart_env, order_ids=[1234, 1235], product_id=10)
    with pytest.raises(BasketPutError) as cm:
        _scan(db, cart_env, order_ids=[1234, 1235], product_id=11)
    assert cm.value.code == "EXPECTED_BASKET_SCAN"
    assert cart_env["pick_calls"] == []
    assert int(put_state.get_pending(cart_env["sess"])["product_id"]) == 10


def test_case5_cancel_pending_no_pick_mutation(db, cart_env):
    cart_env["add_order"](1234, 1, qty=2)
    _scan(db, cart_env, order_ids=[1234])
    assert put_state.get_pending(cart_env["sess"]) is not None
    out = cancel_pending_basket_put(db, cart=cart_env["cart"], operator_user_id=1)
    assert out["cleared"] is True
    assert put_state.get_pending(cart_env["sess"]) is None
    assert cart_env["pick_calls"] == []
    proj = _proj(db, cart_env)
    assert proj["basket_put_pending"] is None


def test_case6_operator_b_cannot_cancel(db, cart_env):
    cart_env["add_order"](1234, 1, qty=1)
    _scan(db, cart_env, order_ids=[1234])
    with pytest.raises(BasketPutError) as cm:
        cancel_pending_basket_put(db, cart=cart_env["cart"], operator_user_id=2)
    assert cm.value.code == "BASKET_PUT_OWNED_BY_OTHER"
    assert put_state.get_pending(cart_env["sess"]) is not None
    assert cart_env["pick_calls"] == []


def test_case7_refresh_keeps_pending_banner(db, cart_env):
    cart_env["add_order"](1234, 1, qty=1)
    _scan(db, cart_env, order_ids=[1234])
    db.commit()
    db.expire_all()
    proj = _proj(db, cart_env)
    assert proj["basket_put_pending"] is not None
    assert int(proj["basket_put_pending"]["product_id"]) == 10


def test_case8_after_basket_confirm_banner_gone(db, cart_env):
    cart_env["add_order"](1234, 1, qty=2)
    _scan(db, cart_env, order_ids=[1234])
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
        order_ids=[1234],
    )
    proj = _proj(db, cart_env)
    assert proj["basket_put_pending"] is None
    assert proj["basket_put_active_series"] is not None
    assert len(cart_env["pick_calls"]) == 1


def test_case9_series_alone_not_shown_as_pending(db, cart_env):
    cart_env["add_order"](1234, 1, qty=5)
    _scan(db, cart_env, order_ids=[1234])
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
        order_ids=[1234],
    )
    # Series active, pending cleared — list must NOT show “1 szt. oczekuje”
    assert put_state.get_pending(cart_env["sess"]) is None
    assert put_state.get_active_series(cart_env["sess"]) is not None
    proj = _proj(db, cart_env)
    assert proj["basket_put_pending"] is None
    assert proj["basket_put_active_series"] is not None


def test_cancel_does_not_clear_series(db, cart_env):
    """If somehow pending existed with series, cancel clears only pending."""
    cart_env["add_order"](1234, 1, qty=5)
    _scan(db, cart_env, order_ids=[1234])
    confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan="S-1-1",
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
        order_ids=[1234],
    )
    # Re-create pending artificially while series active (edge)
    put_state.set_pending(
        db,
        cart_env["sess"],
        {
            "idempotency_key": "edge",
            "operator_user_id": 1,
            "product_id": 10,
            "location_id": 100,
            "quantity": 1.0,
            "eligible_baskets": [],
        },
    )
    cancel_pending_basket_put(db, cart=cart_env["cart"], operator_user_id=1)
    assert put_state.get_pending(cart_env["sess"]) is None
    assert put_state.get_active_series(cart_env["sess"]) is not None
    assert len(cart_env["pick_calls"]) == 1
