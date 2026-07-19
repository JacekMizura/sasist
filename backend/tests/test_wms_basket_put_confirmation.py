"""
Basket put confirmation SSOT — MULTI / baskets picking.

CASE 1–11 (operator semantics):
  1. Same SKU in S-1-1 + S-1-2 → EAN then S-1-2 → +1 only S-1-2
  2. Same setup → EAN then S-1-1 → +1 only S-1-1
  3. No forced basket order
  4. List EAN creates pending (detail awaits basket) — no Pick yet
  5. Refresh after product scan — no double Pick
  6. Wrong basket — qty unchanged, pending kept
  7. Completed basket line — no overpick
  8. 4+5 across two baskets → correct per-order picks
  9. Series after first EAN→S-1-2
 10. Series ends when S-1-2 exhausted
 11. Basket label match + cartless/non-baskets not in this module

  python -m pytest backend/tests/test_wms_basket_put_confirmation.py -q
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

    # Live pick counters per order_item (simulate FulfillmentEvent sums).
    picked_by_oi: dict[int, float] = {}

    def _sum_pick(_db, oi_id, _cid):
        return float(picked_by_oi.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum_pick,
    )

    pick_calls: list[tuple[float, int | None]] = []

    def record_pick_fn(
        *,
        quantity: float,
        fixed_order_id: int | None = None,
        scope_order_id: int | None = None,
    ):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
        pick_calls.append((float(quantity), oid))
        picked_by_oi[oiid] = float(picked_by_oi.get(oiid, 0.0)) + float(quantity)
        return oid, oiid

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
        "picked_by_oi": picked_by_oi,
        "record_pick_fn": record_pick_fn,
        "add_order": add_order,
    }


def _product_scan(db, cart_env, *, order_ids, product_id=10, qty=1.0):
    return handle_product_scan_for_baskets(
        db,
        cart=cart_env["cart"],
        order_ids=order_ids,
        product_id=product_id,
        location_id=100,
        quantity=qty,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
    )


def _confirm(db, cart_env, basket_scan: str, *, order_ids=None):
    return confirm_basket_put(
        db,
        cart=cart_env["cart"],
        basket_scan=basket_scan,
        operator_user_id=1,
        record_pick_fn=cart_env["record_pick_fn"],
        order_ids=order_ids,
    )


def test_case1_ean_then_s12_allocates_only_s12(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    cart_env["add_order"](1235, 2, qty=5)
    r1 = _product_scan(db, cart_env, order_ids=[1234, 1235])
    assert r1.phase == "AWAITING_BASKET_CONFIRMATION"
    assert cart_env["pick_calls"] == []
    assert "order_item_id" not in (r1.pending or {})
    assert "expected_basket_id" not in (r1.pending or {})
    labels = {b["basket_label"] for b in (r1.eligible_baskets or [])}
    assert labels == {"S-1-1", "S-1-2"}

    r2 = _confirm(db, cart_env, "S-1-2", order_ids=[1234, 1235])
    assert r2.phase == "PUT_CONFIRMED"
    assert cart_env["pick_calls"] == [(1.0, 1235)]
    assert int(r2.order_id) == 1235


def test_case2_ean_then_s11_allocates_only_s11(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    cart_env["add_order"](1235, 2, qty=5)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    r2 = _confirm(db, cart_env, "S-1-1", order_ids=[1234, 1235])
    assert r2.phase == "PUT_CONFIRMED"
    assert cart_env["pick_calls"] == [(1.0, 1234)]
    assert int(r2.order_id) == 1234


def test_case3_no_forced_basket_order(db, cart_env):
    """FIFO would force S-1-1 first; operator may start with S-1-2 then switch series to S-1-1."""
    cart_env["add_order"](1234, 1, qty=4)
    cart_env["add_order"](1235, 2, qty=5)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    _confirm(db, cart_env, "S-1-2", order_ids=[1234, 1235])
    assert cart_env["pick_calls"][0][1] == 1235
    assert len(cart_env["pick_calls"]) == 1
    # Switch destination mid-series — NO Pick increment.
    r_sw = _confirm(db, cart_env, "S-1-1", order_ids=[1234, 1235])
    assert r_sw.phase == "SERIES_DESTINATION_SWITCHED"
    assert float(r_sw.quantity_put) == 0
    assert len(cart_env["pick_calls"]) == 1
    series = put_state.get_active_series(cart_env["sess"])
    assert int(series["basket_id"]) == 1
    assert int(series["order_id"]) == 1234
    # Next EAN → +1 to S-1-1
    r_next = _product_scan(db, cart_env, order_ids=[1234, 1235])
    assert r_next.phase == "PUT_CONFIRMED"
    assert int(r_next.order_id) == 1234
    assert [c[1] for c in cart_env["pick_calls"]] == [1235, 1234]


def test_audit_stale_eligible_baskets_not_authorization(db, cart_env):
    """pending.eligible_baskets is UI hint — confirm revalidates live remaining."""
    cart_env["add_order"](1234, 1, qty=1)
    cart_env["add_order"](1235, 2, qty=1)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    pending = put_state.get_pending(cart_env["sess"])
    # Poison snapshot: claim S-1-1 still eligible after we complete it via counter.
    cart_env["picked_by_oi"][12340] = 1.0
    pending["eligible_baskets"] = [
        {
            "basket_id": 1,
            "basket_label": "S-1-1",
            "order_id": 1234,
            "order_item_id": 12340,
            "line_remaining": 99,
        },
        {
            "basket_id": 2,
            "basket_label": "S-1-2",
            "order_id": 1235,
            "order_item_id": 12350,
            "line_remaining": 1,
        },
    ]
    put_state.set_pending(db, cart_env["sess"], pending)
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, cart_env, "S-1-1", order_ids=[1234, 1235])
    assert cm.value.code == "BASKET_PRODUCT_ALREADY_COMPLETE"
    assert cart_env["pick_calls"] == []
    assert put_state.get_pending(cart_env["sess"]) is not None


def test_audit_basket_scan_without_pending_or_series(db, cart_env):
    cart_env["add_order"](1234, 1, qty=1)
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, cart_env, "S-1-1", order_ids=[1234])
    assert cm.value.code == "NO_PENDING_PUT"
    assert cart_env["pick_calls"] == []


def test_audit_product_change_clears_series(db, cart_env):
    cart_env["add_order"](1224, 1, product_id=10, qty=5)
    cart_env["add_order"](1225, 2, product_id=11, qty=5)
    _product_scan(db, cart_env, order_ids=[1224], product_id=10)
    _confirm(db, cart_env, "S-1-1", order_ids=[1224])
    assert put_state.get_active_series(cart_env["sess"]) is not None
    r = _product_scan(db, cart_env, order_ids=[1225], product_id=11)
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert put_state.get_active_series(cart_env["sess"]) is None
    assert int(r.pending["product_id"]) == 11
    assert cart_env["pick_calls"] == [(1.0, 1224)]


def test_audit_series_twenty_units_one_basket_scan(db, cart_env):
    cart_env["add_order"](1224, 1, qty=20)
    _product_scan(db, cart_env, order_ids=[1224])
    _confirm(db, cart_env, "S-1-1", order_ids=[1224])
    assert len(cart_env["pick_calls"]) == 1
    for _ in range(19):
        r = _product_scan(db, cart_env, order_ids=[1224])
        assert r.phase == "PUT_CONFIRMED"
    assert len(cart_env["pick_calls"]) == 20
    # Overpick protection: line exhausted → no series, next EAN has no allocation
    with pytest.raises(BasketPutError) as cm:
        _product_scan(db, cart_env, order_ids=[1224])
    assert cm.value.code == "NO_ALLOCATION"


def test_case4_product_scan_creates_pending_no_pick(db, cart_env):
    """List EAN → pending; detail awaits basket (no second product scan required in SSOT)."""
    cart_env["add_order"](1234, 1, qty=2)
    cart_env["add_order"](1235, 2, qty=2)
    r = _product_scan(db, cart_env, order_ids=[1234, 1235])
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert cart_env["pick_calls"] == []
    pending = put_state.get_pending(cart_env["sess"])
    assert pending is not None
    assert pending["product_id"] == 10
    assert pending.get("idempotency_key")


def test_case5_refresh_pending_no_double_pick(db, cart_env):
    cart_env["add_order"](1234, 1, qty=1)
    _product_scan(db, cart_env, order_ids=[1234])
    db.commit()
    db.expire_all()
    sess2 = db.get(WmsOperationSession, 900)
    pending = put_state.get_pending(sess2)
    assert pending is not None
    assert cart_env["pick_calls"] == []
    # Re-reading pending must not write Pick.
    assert put_state.get_pending(sess2)["idempotency_key"] == pending["idempotency_key"]


def test_case6_wrong_basket_keeps_pending(db, cart_env):
    cart_env["add_order"](1234, 1, qty=1)
    # b2 exists on cart but has no order needing product 10 → BASKET_EMPTY / mismatch
    _product_scan(db, cart_env, order_ids=[1234])
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, cart_env, "S-1-2", order_ids=[1234])
    assert cm.value.code in ("BASKET_EMPTY", "BASKET_PRODUCT_MISMATCH")
    assert cart_env["pick_calls"] == []
    assert put_state.get_pending(cart_env["sess"]) is not None


def test_case7_completed_basket_line_no_overpick(db, cart_env):
    cart_env["add_order"](1234, 1, qty=1)
    cart_env["add_order"](1235, 2, qty=2)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    _confirm(db, cart_env, "S-1-1", order_ids=[1234, 1235])
    assert cart_env["pick_calls"] == [(1.0, 1234)]

    _product_scan(db, cart_env, order_ids=[1234, 1235])
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, cart_env, "S-1-1", order_ids=[1234, 1235])
    assert cm.value.code == "BASKET_PRODUCT_ALREADY_COMPLETE"
    assert len(cart_env["pick_calls"]) == 1
    assert put_state.get_pending(cart_env["sess"]) is not None


def test_case8_split_4_plus_5(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    cart_env["add_order"](1235, 2, qty=5)
    # Fill S-1-1 (4): first basket confirm + series
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    _confirm(db, cart_env, "S-1-1", order_ids=[1234, 1235])
    for _ in range(3):
        r = _product_scan(db, cart_env, order_ids=[1234, 1235])
        assert r.phase == "PUT_CONFIRMED"
        assert int(r.order_id) == 1234
    # Fill S-1-2 (5)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    _confirm(db, cart_env, "S-1-2", order_ids=[1234, 1235])
    for _ in range(4):
        r = _product_scan(db, cart_env, order_ids=[1234, 1235])
        assert r.phase == "PUT_CONFIRMED"
        assert int(r.order_id) == 1235
    assert len(cart_env["pick_calls"]) == 9
    assert sum(q for q, oid in cart_env["pick_calls"] if oid == 1234) == 4
    assert sum(q for q, oid in cart_env["pick_calls"] if oid == 1235) == 5


def test_case9_series_for_s12(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    cart_env["add_order"](1235, 2, qty=5)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    _confirm(db, cart_env, "S-1-2", order_ids=[1234, 1235])
    series = put_state.get_active_series(cart_env["sess"])
    assert int(series["basket_id"]) == 2
    assert int(series["order_id"]) == 1235

    for _ in range(4):
        r = _product_scan(db, cart_env, order_ids=[1234, 1235])
        assert r.phase == "PUT_CONFIRMED"
        assert int(r.order_id) == 1235
    assert sum(q for q, oid in cart_env["pick_calls"] if oid == 1235) == 5
    assert sum(q for q, oid in cart_env["pick_calls"] if oid == 1234) == 0


def test_case10_series_ends_when_s12_exhausted(db, cart_env):
    cart_env["add_order"](1234, 1, qty=4)
    cart_env["add_order"](1235, 2, qty=2)
    _product_scan(db, cart_env, order_ids=[1234, 1235])
    _confirm(db, cart_env, "S-1-2", order_ids=[1234, 1235])
    r = _product_scan(db, cart_env, order_ids=[1234, 1235])
    assert r.phase == "PUT_CONFIRMED"  # series second unit
    assert put_state.get_active_series(cart_env["sess"]) is None

    r2 = _product_scan(db, cart_env, order_ids=[1234, 1235])
    assert r2.phase == "AWAITING_BASKET_CONFIRMATION"
    labels = {b["basket_label"] for b in (r2.eligible_baskets or [])}
    assert "S-1-1" in labels
    assert "S-1-2" not in labels


def test_case11_basket_label_match_and_single_order_flow(db, cart_env):
    assert basket_scan_matches(cart_env["b1"], "S-1-1")
    assert basket_scan_matches(cart_env["b1"], "CART-0050-B01")
    assert primary_basket_label(cart_env["b1"]) == "S-1-1"

    cart_env["add_order"](1224, 1, qty=1)
    r1 = _product_scan(db, cart_env, order_ids=[1224])
    assert r1.phase == "AWAITING_BASKET_CONFIRMATION"
    r2 = _confirm(db, cart_env, "S-1-1", order_ids=[1224])
    assert r2.phase == "PUT_CONFIRMED"
    assert len(cart_env["pick_calls"]) == 1


def test_product_again_while_pending(db, cart_env):
    cart_env["add_order"](1224, 1, qty=5)
    _product_scan(db, cart_env, order_ids=[1224])
    with pytest.raises(BasketPutError) as cm:
        _product_scan(db, cart_env, order_ids=[1224])
    assert cm.value.code == "EXPECTED_BASKET_SCAN"
    assert cart_env["pick_calls"] == []


def test_destination_change_resets_series(db, cart_env):
    cart_env["add_order"](1224, 1, product_id=10, qty=2)
    cart_env["add_order"](1225, 2, product_id=11, qty=2)
    _product_scan(db, cart_env, order_ids=[1224], product_id=10)
    _confirm(db, cart_env, "S-1-1", order_ids=[1224])
    r = _product_scan(db, cart_env, order_ids=[1225], product_id=11)
    assert r.phase == "AWAITING_BASKET_CONFIRMATION"
    assert put_state.get_active_series(cart_env["sess"]) is None
    labels = {b["basket_label"] for b in (r.eligible_baskets or [])}
    assert labels == {"S-1-2"}


def test_double_confirm_no_pending(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    _product_scan(db, cart_env, order_ids=[1224])
    _confirm(db, cart_env, "S-1-1", order_ids=[1224])
    with pytest.raises(BasketPutError) as cm:
        _confirm(db, cart_env, "S-1-1", order_ids=[1224])
    assert cm.value.code == "NO_PENDING_PUT"
    assert len(cart_env["pick_calls"]) == 1


def test_clear_on_shortage(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    _product_scan(db, cart_env, order_ids=[1224])
    clear_basket_put_state(db, session=cart_env["sess"], reason="shortage")
    assert put_state.get_pending(cart_env["sess"]) is None


def test_operator_isolation(db, cart_env):
    cart_env["add_order"](1224, 1, qty=1)
    _product_scan(db, cart_env, order_ids=[1224])
    with pytest.raises(BasketPutError) as cm:
        confirm_basket_put(
            db,
            cart=cart_env["cart"],
            basket_scan="S-1-1",
            operator_user_id=2,
            record_pick_fn=cart_env["record_pick_fn"],
            order_ids=[1224],
        )
    assert cm.value.code == "BASKET_PUT_OWNED_BY_OTHER"
    assert cart_env["pick_calls"] == []
