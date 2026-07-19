"""
SERIES LINE PROGRESS SSOT — live line_remaining ≠ product aggregate.

CASE 1: 2×qty9, pick S-1-2 → aggregate 1/18, series.line_remaining=8
CASE 2: next series EAN → aggregate 2/18, series.line_remaining=7
CASE 3: switch S-1-1 → S-1-2 (qty=0) → live remaining for S-1-2
CASE 4: refresh UI state re-resolves from DB (not metadata snapshot)
CASE 5: line exhausted → series cleared (existing SSOT)

  python -m pytest backend/tests/test_wms_basket_put_series_line_progress.py -q
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

    def add_order(oid: int, basket_id: int, qty: float = 9):
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
                product_id=192,
                quantity=qty,
                unit_price=1.0,
            )
        )
        db.get(CartBasket, basket_id).order_id = oid
        db.commit()

    def aggregate_progress():
        total_need = 18.0
        total_picked = sum(picked.values())
        return total_picked, total_need

    return {
        "cart": cart,
        "sess": sess,
        "pick_calls": pick_calls,
        "picked": picked,
        "record_pick_fn": record_pick_fn,
        "add_order": add_order,
        "aggregate_progress": aggregate_progress,
    }


def _scan(db, env):
    return handle_product_scan_for_baskets(
        db,
        cart=env["cart"],
        order_ids=[1234, 1235],
        product_id=192,
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


def _ui(db, env):
    return get_basket_put_ui_state(
        db, cart=env["cart"], product_id=192, order_ids=[1234, 1235], sanitize=True
    )


def test_case1_after_first_s12_pick_series_remaining_is_8_not_17(db, env):
    env["add_order"](1234, 10, qty=9)
    env["add_order"](1235, 11, qty=9)
    _scan(db, env)
    r = _confirm(db, env, "S-1-2")
    assert r.phase == "PUT_CONFIRMED"
    agg_picked, agg_need = env["aggregate_progress"]()
    assert (agg_picked, agg_need) == (1.0, 18.0)
    assert float(r.active_series["line_remaining"]) == 8.0
    assert int(r.active_series["basket_id"]) == 11
    ui = _ui(db, env)
    assert float(ui["active_series"]["line_remaining"]) == 8.0
    # Must not look like product aggregate remaining (17).
    assert float(ui["active_series"]["line_remaining"]) != 17.0


def test_case2_next_series_ean_decrements_line_not_only_aggregate(db, env):
    env["add_order"](1234, 10, qty=9)
    env["add_order"](1235, 11, qty=9)
    _scan(db, env)
    _confirm(db, env, "S-1-2")
    r = _scan(db, env)
    assert r.phase == "PUT_CONFIRMED"
    agg_picked, agg_need = env["aggregate_progress"]()
    assert (agg_picked, agg_need) == (2.0, 18.0)
    assert float(r.active_series["line_remaining"]) == 7.0
    ui = _ui(db, env)
    assert float(ui["active_series"]["line_remaining"]) == 7.0


def test_case3_destination_switch_shows_live_s12_remaining(db, env):
    env["add_order"](1234, 10, qty=9)
    env["add_order"](1235, 11, qty=9)
    _scan(db, env)
    _confirm(db, env, "S-1-1")
    assert env["aggregate_progress"]()[0] == 1.0
    sw = _confirm(db, env, "S-1-2")
    assert sw.phase == "SERIES_DESTINATION_SWITCHED"
    assert float(sw.quantity_put) == 0.0
    assert len(env["pick_calls"]) == 1
    # S-1-2 still fully open (9); switch must not invent Pick.
    assert float(sw.active_series["line_remaining"]) == 9.0
    assert int(sw.active_series["basket_id"]) == 11
    ui = _ui(db, env)
    assert float(ui["active_series"]["line_remaining"]) == 9.0
    assert ui["active_series"]["basket_label"] == "S-1-2"


def test_case4_refresh_recomputes_live_remaining_not_metadata_snapshot(db, env):
    env["add_order"](1234, 10, qty=9)
    env["add_order"](1235, 11, qty=9)
    _scan(db, env)
    _confirm(db, env, "S-1-2")
    # Corrupt metadata with a stale snapshot-like field — UI must ignore it.
    raw = put_state.get_active_series(env["sess"])
    assert raw is not None
    raw = {**raw, "line_remaining": 99}
    put_state.set_active_series(db, env["sess"], raw)
    db.commit()
    ui = _ui(db, env)
    assert float(ui["active_series"]["line_remaining"]) == 8.0
    assert float(ui["active_series"]["line_remaining"]) != 99.0
    # Metadata itself is not the SSOT for remaining (projection overwrites for response).
    stored = put_state.get_active_series(env["sess"])
    assert stored.get("line_remaining") == 99  # stale junk may remain stored
    assert float(ui["active_series"]["line_remaining"]) == 8.0


def test_case5_line_exhausted_clears_series(db, env):
    env["add_order"](1234, 10, qty=9)
    env["add_order"](1235, 11, qty=2)
    _scan(db, env)
    _confirm(db, env, "S-1-2")
    r = _scan(db, env)
    assert r.phase == "PUT_CONFIRMED"
    assert r.active_series is None
    assert put_state.get_active_series(env["sess"]) is None
    # Next EAN → unbound pending, no auto S-1-1.
    r2 = _scan(db, env)
    assert r2.phase == "AWAITING_BASKET_CONFIRMATION"
    assert put_state.get_pending(env["sess"]) is not None
    assert put_state.get_active_series(env["sess"]) is None
    labels = {b["basket_label"] for b in (r2.eligible_baskets or [])}
    assert "S-1-1" in labels
    assert "S-1-2" not in labels
