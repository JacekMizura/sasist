"""
LIVE repro regression: #1234 S-1-1 qty=8 complete + #1235 S-1-2 qty=1 must accept brck1-B02.

Also: stale wms_picking_line_status='picked' with rem>0 must NOT empty eligible.

  python -m pytest backend/tests/test_wms_multi_basket_live_mismatch.py -q
"""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartType
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
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.resolve import (
    explain_basket_allocation_candidates,
    list_eligible_basket_allocations,
    resolve_allocation_for_basket_scan,
)
from backend.services.wms_basket_put.scan_service import BasketPutError, confirm_basket_put


PRODUCT_ID = 192
LOC = 100


@pytest.fixture
def db():
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
        FulfillmentEvent,
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=PRODUCT_ID, tenant_id=1, name="X", sku="CAT", ean="5905450181208"))
    session.add(Location(id=LOC, warehouse_id=1, name="A23-A-2", is_active=True))
    session.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PRODUCT_ID,
            location_id=LOC,
            quantity=50.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
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
    db.add_all([cart, b1, b2, sess])
    cart.current_session_id = 1

    o1 = Order(
        id=1234,
        tenant_id=1,
        warehouse_id=1,
        number="1234",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=10,
        picking_session_id=1,
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    o2 = Order(
        id=1235,
        tenant_id=1,
        warehouse_id=1,
        number="1235",
        status="PICKING",
        fulfillment_state="PICKING",
        cart_id=2,
        basket_id=11,
        picking_session_id=1,
        total_volume_dm3=1.0,
        created_at=now,
        picking_started_at=now,
    )
    db.add_all([o1, o2])
    db.flush()
    oi1 = OrderItem(id=12340, order_id=1234, product_id=PRODUCT_ID, quantity=8.0, unit_price=1.0)
    oi2 = OrderItem(id=12350, order_id=1235, product_id=PRODUCT_ID, quantity=1.0, unit_price=1.0)
    db.add_all([oi1, oi2])
    b1.order_id = 1234
    b2.order_id = 1235
    db.commit()

    picked: dict[int, float] = {}

    def _sum(_db, oi_id, _cid):
        return float(picked.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )

    pick_calls: list[tuple[float, int]] = []

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
        pick_calls.append((float(quantity), oid))
        picked[oiid] = float(picked.get(oiid, 0.0)) + float(quantity)
        return oid, oiid

    return {
        "cart": cart,
        "sess": sess,
        "b1": b1,
        "b2": b2,
        "picked": picked,
        "pick_calls": pick_calls,
        "record_pick_fn": record_pick_fn,
        "order_ids": [1234, 1235],
    }


def test_exact_flow_s11_complete_then_s12_brck_ok(db, env):
    # Put 8 → S-1-1
    r1 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B01",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC,
        quantity=8.0,
    )
    assert r1.phase == "PUT_CONFIRMED"
    assert env["pick_calls"] == [(8.0, 1234)]
    assert env["picked"].get(12340) == pytest.approx(8.0)

    # #1235 still eligible for S-1-2
    live = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert len(live) == 1
    assert int(live[0].basket_id) == 11
    assert int(live[0].order_id) == 1235
    assert float(live[0].line_remaining) == pytest.approx(1.0)

    r2 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC,
        quantity=1.0,
    )
    assert r2.phase == "PUT_CONFIRMED"
    assert env["pick_calls"][-1] == (1.0, 1235)
    assert env["picked"].get(12350) == pytest.approx(1.0)

    live_after = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert live_after == []


def test_A_correct_s12_ok(db, env):
    alloc, err = resolve_allocation_for_basket_scan(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID, basket=env["b2"]
    )
    assert err is None
    assert alloc is not None
    assert int(alloc.order_id) == 1235


def test_B_completed_s11_mismatch(db, env):
    env["picked"][12340] = 8.0
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B01",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC,
            quantity=1.0,
        )
    # Completed line → ALREADY_COMPLETE or MISMATCH depending on path; both 409
    assert ei.value.code in (ec.BASKET_PRODUCT_MISMATCH, "BASKET_PRODUCT_ALREADY_COMPLETE", ec.BASKET_PRODUCT_ALREADY_COMPLETE if hasattr(ec, "BASKET_PRODUCT_ALREADY_COMPLETE") else "BASKET_PRODUCT_ALREADY_COMPLETE")


def test_C_foreign_cart_same_label_mismatch(db, env):
    """Scan barcode of another cart's S-1-2 → 409 (not accept by label alone)."""
    other = Cart(
        id=9,
        tenant_id=1,
        warehouse_id=1,
        name="other",
        code="other",
        type=CartType.MULTI,
        status="PICKING",
    )
    bf = CartBasket(
        id=99,
        cart_id=9,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="other-B02",
        scan_code="other-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
        order_id=9999,
    )
    db.add_all([other, bf])
    db.commit()

    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="other-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC,
            quantity=1.0,
        )
    # Foreign physical barcode must not resolve onto active cart (OTHER_CART or MISMATCH).
    assert ei.value.code in (ec.BASKET_OTHER_CART, ec.BASKET_MISMATCH, ec.BASKET_PRODUCT_MISMATCH)
    assert ei.value.http_status == 409


def test_C2_order_basket_off_cart_local_b02_mismatch(db, env):
    """Order.basket_id points off active cart → local brck1-B02 not eligible / 409 + diagnostics."""
    other = Cart(
        id=9,
        tenant_id=1,
        warehouse_id=1,
        name="other",
        code="other",
        type=CartType.MULTI,
        status="PICKING",
    )
    bf = CartBasket(
        id=99,
        cart_id=9,
        warehouse_id=1,
        row=0,
        column=1,
        name="S-1-2",
        barcode="other-B02",
        scan_code="other-B02",
        inner_length=1,
        inner_width=1,
        inner_height=1,
        usable_volume=100,
        used_volume=0,
    )
    db.add_all([other, bf])
    o2 = db.get(Order, 1235)
    o2.basket_id = 99
    db.commit()

    live, rejected = explain_basket_allocation_candidates(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert not any(int(a.basket_id) == 11 for a in live)
    assert any(int(r["order_id"]) == 1235 for r in rejected)

    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC,
            quantity=1.0,
        )
    assert ei.value.code == ec.BASKET_PRODUCT_MISMATCH
    assert "rejected_allocations" in ei.value.extra
    assert "eligible_baskets" in ei.value.extra
    assert not any(int(b.get("basket_id") or 0) == 11 for b in (ei.value.extra.get("eligible_baskets") or []))


def test_D_stale_picked_status_still_eligible(db, env):
    """LIVE-shaped: rem=1 but status=picked → must still be eligible after heal."""
    oi2 = db.get(OrderItem, 12350)
    oi2.wms_picking_line_status = "picked"
    db.commit()

    live = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert any(int(a.order_id) == 1235 and int(a.basket_id) == 11 for a in live)

    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC,
        quantity=1.0,
    )
    assert r.phase == "PUT_CONFIRMED"
    db.refresh(oi2)
    # After heal+put, status may be re-set by record path; quantity committed
    assert env["picked"].get(12350) == pytest.approx(1.0)


def test_F_shortage_not_eligible_no_pending_put(db, env):
    """Missing line must leave eligible and not be accepted for basket put."""
    oi2 = db.get(OrderItem, 12350)
    oi2.wms_picking_line_missing_qty = 1.0
    oi2.wms_picking_line_status = "missing"
    db.commit()

    live = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert not any(int(a.order_id) == 1235 for a in live)

    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC,
            quantity=1.0,
        )
    assert ei.value.code in (ec.BASKET_PRODUCT_MISMATCH, "BASKET_PRODUCT_ALREADY_COMPLETE")
    assert env["picked"].get(12350, 0.0) == 0.0


def test_E_after_confirm_s12_no_longer_eligible(db, env):
    confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC,
        quantity=1.0,
    )
    live = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert not any(int(a.basket_id) == 11 for a in live)


def test_G_no_fifo_product_id_two_open_lines(db, env):
    live = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    labels = {a.basket_label for a in live}
    assert labels == {"S-1-1", "S-1-2"}
    # Scan S-1-2 must bind 1235 not 1234
    alloc, err = resolve_allocation_for_basket_scan(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID, basket=env["b2"]
    )
    assert err is None
    assert int(alloc.order_id) == 1235


def test_H_refresh_eligible_stable_before_confirm(db, env):
    live1 = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    live2 = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert {(a.basket_id, a.order_item_id, a.line_remaining) for a in live1} == {
        (a.basket_id, a.order_item_id, a.line_remaining) for a in live2
    }
    assert any(int(a.basket_id) == 11 for a in live2)
