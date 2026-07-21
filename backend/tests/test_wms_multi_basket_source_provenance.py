"""
MULTI quantity-mode SOURCE LOCK provenance.

Exact LIVE flow + security A–O.

  python -m pytest backend/tests/test_wms_multi_basket_source_provenance.py -q
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
from backend.services.wms_basket_put import state as put_state
from backend.services.wms_basket_put.resolve import list_eligible_basket_allocations
from backend.services.wms_basket_put.scan_service import (
    BasketPutError,
    clear_basket_put_state,
    confirm_basket_put,
)
from backend.services.wms_basket_put.source_lock import accept_source_location
from backend.services.wms_picking_product_list_service import _allowed_pick_location_ids_for_product


PRODUCT_ID = 192
PRODUCT_B = 193
LOC_A10 = 101
LOC_A23 = 102


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
    session.add(Product(id=PRODUCT_ID, tenant_id=1, name="Sznurowadła CAT", sku="ST-003", ean="5905450181208"))
    session.add(Product(id=PRODUCT_B, tenant_id=1, name="Inny SKU", sku="OTHER", ean="5900000000001"))
    session.add(Location(id=LOC_A10, warehouse_id=1, name="A10-A-1", is_active=True))
    session.add(Location(id=LOC_A23, warehouse_id=1, name="A23-A-2", is_active=True))
    session.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PRODUCT_ID,
            location_id=LOC_A10,
            quantity=8.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    session.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
            batch_number="",
            expiry_date=date(9999, 12, 31),
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    session.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PRODUCT_B,
            location_id=LOC_A10,
            quantity=5.0,
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
    pick_locs: list[tuple[float, int, int]] = []

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

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None, location_id=None):
        oid = int(scope_order_id if scope_order_id is not None else (fixed_order_id or 0))
        oiid = oid * 10
        loc = int(location_id) if location_id is not None else 0
        pick_locs.append((float(quantity), oid, loc))
        picked[oiid] = float(picked.get(oiid, 0.0)) + float(quantity)
        return oid, oiid

    def lock_a23(*, product_id: int = PRODUCT_ID, operator: int | None = 1):
        return accept_source_location(
            db,
            cart=cart,
            sess=sess,
            product_id=product_id,
            location_id=LOC_A23,
            operator_user_id=operator,
        )

    return {
        "cart": cart,
        "sess": sess,
        "picked": picked,
        "pick_locs": pick_locs,
        "record_pick_fn": record_pick_fn,
        "order_ids": [1234, 1235],
        "lock_a23": lock_a23,
    }


def test_greedy_route_for_remaining_line_prefers_a10_physical(db, env, monkeypatch):
    monkeypatch.setattr(
        "backend.services.inventory_count.inventory_movement_guard_service.locked_location_ids_for_picking",
        lambda *a, **k: set(),
    )
    env["picked"][12340] = 8.0
    allowed_1235 = _allowed_pick_location_ids_for_product(
        db, tenant_id=1, order_ids=[1235], product_id=PRODUCT_ID
    )
    assert LOC_A10 in allowed_1235
    assert LOC_A23 not in allowed_1235


def test_exact_live_a23_lock_survives_refetch_and_brck1_b02(db, env, monkeypatch):
    """Exact LIVE: accept A23 → refetch keeps lock → greedy still A10 → B02 Pick=A23 → clear."""
    monkeypatch.setattr(
        "backend.services.inventory_count.inventory_movement_guard_service.locked_location_ids_for_picking",
        lambda *a, **k: set(),
    )
    env["picked"][12340] = 8.0

    lock = env["lock_a23"]()
    assert int(lock["product_id"]) == PRODUCT_ID
    assert int(lock["location_id"]) == LOC_A23

    # Simulate detail refetch — lock must remain (quantity_mode must not wipe source_lock).
    persisted = put_state.get_source_lock(env["sess"])
    assert persisted is not None
    assert int(persisted["location_id"]) == LOC_A23

    # Greedy route still prefers A10 physically — must not mutate provenance.
    allowed = _allowed_pick_location_ids_for_product(
        db, tenant_id=1, order_ids=[1235], product_id=PRODUCT_ID
    )
    assert LOC_A10 in allowed
    assert LOC_A23 not in allowed
    assert int(put_state.get_source_lock(env["sess"])["location_id"]) == LOC_A23

    live = list_eligible_basket_allocations(
        db, cart=env["cart"], order_ids=env["order_ids"], product_id=PRODUCT_ID
    )
    assert len(live) == 1
    assert int(live[0].basket_id) == 11

    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC_A23,
        quantity=1.0,
    )
    assert r.phase == "PUT_CONFIRMED"
    assert env["pick_locs"][-1] == (1.0, 1235, LOC_A23)
    assert env["picked"].get(12350) == pytest.approx(1.0)
    assert put_state.get_source_lock(env["sess"]) is None


def test_A_correct_source_and_basket(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC_A23,
        quantity=1.0,
    )
    assert r.phase == "PUT_CONFIRMED"
    assert env["pick_locs"][-1][2] == LOC_A23


def test_B_body_location_mismatch_rejects_never_pick_a10(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A10,
            quantity=1.0,
        )
    assert ei.value.code == ec.SOURCE_LOCATION_MISMATCH
    assert env["pick_locs"] == []
    assert put_state.get_source_lock(env["sess"]) is not None
    assert int(put_state.get_source_lock(env["sess"])["location_id"]) == LOC_A23


def test_C_no_source_lock_rejects(db, env):
    env["picked"][12340] = 8.0
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code == ec.NO_PENDING_SOURCE_LOCATION
    assert env["pick_locs"] == []


def test_D_lock_product_a_cannot_confirm_product_b(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"](product_id=PRODUCT_ID)
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_B,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code in (ec.PENDING_PICK_STATE_CONFLICT, ec.NO_PENDING_SOURCE_LOCATION)
    assert env["pick_locs"] == []
    # Foreign lock must not remain usable for product B.
    lock_after = put_state.get_source_lock(env["sess"])
    assert lock_after is None or int(lock_after.get("product_id") or 0) != PRODUCT_B


def test_E_lock_other_cart_session_rejects(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    lock = put_state.get_source_lock(env["sess"])
    assert lock is not None
    lock["cart_id"] = 999
    put_state.set_source_lock(db, env["sess"], lock)
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code == ec.PENDING_PICK_STATE_CONFLICT


def test_F_cross_warehouse_rejects(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    lock = put_state.get_source_lock(env["sess"])
    lock["warehouse_id"] = 99
    put_state.set_source_lock(db, env["sess"], lock)
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code == ec.SOURCE_LOCATION_INVALID


def test_G_stock_drained_before_confirm_rejects_no_pick(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.product_id == PRODUCT_ID,
            Inventory.location_id == LOC_A23,
        )
        .first()
    )
    inv.quantity = 0.0
    db.flush()
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    assert env["pick_locs"] == []
    assert put_state.get_source_lock(env["sess"]) is not None


def test_H_qty_exceeds_live_effective(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=5.0,
        )
    assert ei.value.code in (ec.QUANTITY_EXCEEDS_LOCATION_STOCK, ec.QUANTITY_EXCEEDS_REMAINING)
    assert env["pick_locs"] == []


def test_I_wrong_basket_keeps_source_lock(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B01",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    assert ei.value.code == ec.BASKET_PRODUCT_MISMATCH
    assert put_state.get_source_lock(env["sess"]) is not None
    assert int(put_state.get_source_lock(env["sess"])["location_id"]) == LOC_A23


def test_J_retry_after_wrong_basket_succeeds_and_clears(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    with pytest.raises(BasketPutError):
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B01",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A23,
            quantity=1.0,
        )
    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC_A23,
        quantity=1.0,
    )
    assert r.phase == "PUT_CONFIRMED"
    assert env["pick_locs"][-1][2] == LOC_A23
    assert put_state.get_source_lock(env["sess"]) is None


def test_K_cancel_session_clears_lock(db, env):
    env["lock_a23"]()
    assert put_state.get_source_lock(env["sess"]) is not None
    clear_basket_put_state(db, session=env["sess"], reason="cancel_picking")
    assert put_state.get_source_lock(env["sess"]) is None


def test_L_release_clears_lock(db, env):
    env["lock_a23"]()
    clear_basket_put_state(db, cart=env["cart"], reason="release_cart:idle")
    assert put_state.get_source_lock(env["sess"]) is None


def test_M_parallel_last_unit_only_one_pick(db, env):
    """Second confirm after first consumes stock → reject, only one Pick."""
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    r1 = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=LOC_A23,
        quantity=1.0,
    )
    assert r1.phase == "PUT_CONFIRMED"
    # Simulate competing cart consuming physical stock after first pick finalized Inventory
    # (here: drain inventory; second attempt with new lock fails live stock).
    inv = (
        db.query(Inventory)
        .filter(Inventory.product_id == PRODUCT_ID, Inventory.location_id == LOC_A23)
        .first()
    )
    inv.quantity = 0.0
    db.flush()
    accept_source_location(
        db,
        cart=env["cart"],
        sess=env["sess"],
        product_id=PRODUCT_ID,
        location_id=LOC_A10,
        operator_user_id=1,
    )
    # Line already complete — mismatch/complete or stock; either way no second pick on A23.
    with pytest.raises(BasketPutError):
        confirm_basket_put(
            db,
            cart=env["cart"],
            basket_scan="brck1-B02",
            operator_user_id=1,
            record_pick_fn=env["record_pick_fn"],
            order_ids=env["order_ids"],
            product_id=PRODUCT_ID,
            location_id=LOC_A10,
            quantity=1.0,
        )
    a23_picks = [p for p in env["pick_locs"] if p[2] == LOC_A23]
    assert len(a23_picks) == 1


def test_N_refetch_does_not_clear_server_lock(db, env):
    env["lock_a23"]()
    # quantity-mode detail used to call clear_basket_put_state — ensure only pending/series clear.
    put_state.set_pending(
        db,
        env["sess"],
        {"product_id": PRODUCT_ID, "location_id": LOC_A10, "quantity": 1},
    )
    put_state.set_pending(db, env["sess"], None)
    put_state.set_active_series(db, env["sess"], None)
    assert put_state.get_source_lock(env["sess"]) is not None
    assert int(put_state.get_source_lock(env["sess"])["location_id"]) == LOC_A23


def test_O_greedy_route_change_does_not_mutate_lock(db, env, monkeypatch):
    monkeypatch.setattr(
        "backend.services.inventory_count.inventory_movement_guard_service.locked_location_ids_for_picking",
        lambda *a, **k: set(),
    )
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    allowed = _allowed_pick_location_ids_for_product(
        db, tenant_id=1, order_ids=[1235], product_id=PRODUCT_ID
    )
    assert LOC_A10 in allowed
    assert int(put_state.get_source_lock(env["sess"])["location_id"]) == LOC_A23


def test_body_omitted_uses_lock_location(db, env):
    env["picked"][12340] = 8.0
    env["lock_a23"]()
    r = confirm_basket_put(
        db,
        cart=env["cart"],
        basket_scan="brck1-B02",
        operator_user_id=1,
        record_pick_fn=env["record_pick_fn"],
        order_ids=env["order_ids"],
        product_id=PRODUCT_ID,
        location_id=None,
        quantity=1.0,
    )
    assert r.phase == "PUT_CONFIRMED"
    assert env["pick_locs"][-1][2] == LOC_A23
