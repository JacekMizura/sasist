"""
LIVE finalize 409 class: legacy bad Pick provenance vs write-path gate.

CASE 1 — Pick1 LOC-A=3, Pick2 LOC-A=5, stock=4 → fail wymagane 5 dostępne 1 + rollback
CASE 2 — write path blocks Pick2 qty=5 when effective=1
CASE 3 — valid multi-loc finalize success
CASE 4 — exact capacity 1 allowed / 2 rejected
CASE 5 — finalized Pick not double-reserved in effective
CASE 6 — rollback atomicity (covered in CASE 1)
CASE 7 — shortage on one line does not change inventory consume of picks

  python -m pytest backend/tests/test_wms_finalize_legacy_location_mismatch.py -q
"""

from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.enums import CartType
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.order_item_pick_allocation_service import consume_inventory_fifo_slices
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.location_stock import (
    effective_pickable_qty_at_location,
    on_hand_qty_at_location,
)
from backend.services.wms_basket_put.scan_service import BasketPutError, confirm_basket_put
from backend.services.wms_picking_product_list_service import (
    PickingFinalizeError,
    _finalize_pick_trace_payload,
)


LOC_A = 100
LOC_B = 101


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
        WmsOperationSession,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(Product(id=192, tenant_id=1, name="X", sku="ST-003", ean="5905450181208"))
    session.add(Location(id=LOC_A, warehouse_id=1, name="A10-A-1", is_active=True))
    session.add(Location(id=LOC_B, warehouse_id=1, name="A23-A-2", is_active=True))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _seed_cart(db, now):
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
    for oid, bid, qty, miss in ((1234, 10, 8.0, 0.0), (1235, 11, 1.0, 1.0)):
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
                wms_picking_line_missing_qty=miss,
            )
        )
        db.get(CartBasket, bid).order_id = oid
    db.commit()
    return cart, sess


def _set_stock(db, *, loc_a: float, loc_b: float = 0.0):
    db.query(Inventory).delete()
    db.flush()
    for lid, qty in ((LOC_A, loc_a), (LOC_B, loc_b)):
        if qty <= 0:
            continue
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                product_id=192,
                location_id=lid,
                quantity=float(qty),
                batch_number="",
                expiry_date=date(9999, 12, 31),
                stock_disposition=STOCK_DISPOSITION_SALEABLE,
            )
        )
    db.commit()


def _add_draft_pick(db, *, location_id: int, quantity: float, order_id: int = 1234, created_at=None):
    p = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=order_id,
        order_item_id=order_id * 10,
        product_id=192,
        location_id=int(location_id),
        cart_id=2,
        quantity=float(quantity),
        picked_at=None,
        status="picking",
    )
    if created_at is not None:
        p.created_at = created_at
    db.add(p)
    db.commit()
    db.refresh(p)
    return p


def _inv(db, location_id: int) -> float:
    return on_hand_qty_at_location(
        db,
        tenant_id=1,
        warehouse_id=1,
        product_id=192,
        location_id=location_id,
        for_update=False,
    )


def _run_finalize_inventory_loop(db, cart_id: int = 2):
    """
    Mirrors finalize inventory consume SSOT:
    for each pending Pick → consume_inventory_fifo_slices(Pick.location_id, Pick.quantity).
    (Full _decrement_inventory_for_wms_pick also writes stock_movements / allocations —
    stock shortage raises in consume_inventory_fifo_slices first — same LIVE error.)
    """
    pending = (
        db.query(Pick)
        .filter(Pick.cart_id == cart_id, Pick.picked_at.is_(None), Pick.product_id == 192)
        .order_by(Pick.id.asc())
        .all()
    )
    now = datetime.utcnow()
    finalized_ids: list[int] = []
    traces = []
    for p in pending:
        trace = _finalize_pick_trace_payload(
            db, p, cart_id=cart_id, prior_consumed_pick_ids=list(finalized_ids)
        )
        traces.append(trace)
        try:
            consume_inventory_fifo_slices(
                db,
                tenant_id=int(p.tenant_id),
                warehouse_id=int(p.warehouse_id or 0),
                product_id=int(p.product_id),
                location_id=int(p.location_id),
                quantity=float(p.quantity or 0),
            )
        except Exception as exc:
            raise PickingFinalizeError(
                f"Nie udało się spisać stanu magazynu dla zbierania: {exc}",
                reason=type(exc).__name__,
                step="inventory",
                http_status=409,
                code="inventory_finalize_failed",
                extra={"failing_pick": {**trace, "error": str(exc)}},
            ) from exc
        p.picked_at = now
        p.status = "done"
        finalized_ids.append(int(p.id))
    return traces, finalized_ids


def test_case1_live_legacy_3_plus_5_fails_available_1_and_rolls_back(db):
    """Exact LIVE error class: after Pick1 consumes 3 of 4, Pick2 qty=5 sees available=1."""
    now = datetime.utcnow()
    _seed_cart(db, now)
    _set_stock(db, loc_a=4.0, loc_b=10.0)
    p1 = _add_draft_pick(db, location_id=LOC_A, quantity=3.0, order_id=1234)
    p2 = _add_draft_pick(db, location_id=LOC_A, quantity=5.0, order_id=1234)
    p1_id, p2_id = int(p1.id), int(p2.id)
    assert float(p1.quantity) + float(p2.quantity) == 8.0

    stock_before_a = _inv(db, LOC_A)
    stock_before_b = _inv(db, LOC_B)
    assert stock_before_a == 4.0

    with pytest.raises(PickingFinalizeError) as ei:
        _run_finalize_inventory_loop(db)
    err = ei.value
    assert err.code == "inventory_finalize_failed"
    fail = err.extra.get("failing_pick") or {}
    assert int(fail["pick_id"]) == p2_id
    assert float(fail["pick_quantity"]) == 5.0
    assert float(fail["inventory_physical_available"]) == 1.0
    err_text = f"{fail.get('error', '')} {err}".lower()
    assert "wymagane 5" in err_text
    assert "dostępne 1" in err_text
    # Running example: Pick1 left physical=1 before Pick2
    assert int(fail["prior_consumed_pick_ids_this_txn"][0]) == p1_id

    db.rollback()
    assert _inv(db, LOC_A) == stock_before_a
    assert _inv(db, LOC_B) == stock_before_b
    p1r = db.get(Pick, p1_id)
    p2r = db.get(Pick, p2_id)
    assert p1r is not None and p1r.picked_at is None
    assert p2r is not None and p2r.picked_at is None


def test_case2_write_path_blocks_second_pick_when_effective_1(db, monkeypatch):
    now = datetime.utcnow()
    cart, sess = _seed_cart(db, now)
    _set_stock(db, loc_a=4.0, loc_b=10.0)
    _add_draft_pick(db, location_id=LOC_A, quantity=3.0, order_id=1234)

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    picked = {12340: 3.0}

    def _sum(_db, oi_id, _cid):
        return float(picked.get(int(oi_id), 0.0))

    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        _sum,
    )

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        raise AssertionError("Pick must not be written when stock exceeded")

    avail = effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
    )
    assert avail == 1.0

    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=cart,
            basket_scan="brck1-B01",
            operator_user_id=1,
            record_pick_fn=record_pick_fn,
            order_ids=[1234, 1235],
            product_id=192,
            location_id=LOC_A,
            quantity=5,
        )
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    assert db.query(Pick).filter(Pick.picked_at.is_(None)).count() == 1


def test_case3_valid_multi_location_finalize(db):
    now = datetime.utcnow()
    _seed_cart(db, now)
    _set_stock(db, loc_a=4.0, loc_b=10.0)
    _add_draft_pick(db, location_id=LOC_A, quantity=3.0, order_id=1234)
    _add_draft_pick(db, location_id=LOC_B, quantity=5.0, order_id=1234)
    traces, ids = _run_finalize_inventory_loop(db)
    db.commit()
    assert len(ids) == 2
    assert _inv(db, LOC_A) == 1.0
    assert _inv(db, LOC_B) == 5.0
    assert all(t["shortage_for_order_item"] == 0.0 for t in traces if t["order_id"] == 1234)


def test_case4_exact_capacity(db, monkeypatch):
    now = datetime.utcnow()
    cart, sess = _seed_cart(db, now)
    _set_stock(db, loc_a=4.0, loc_b=0.0)
    _add_draft_pick(db, location_id=LOC_A, quantity=3.0)

    monkeypatch.setattr(
        "backend.services.wms_basket_put.scan_service.assert_cart_ready_for_quick_pick",
        lambda db, cart: sess,
    )
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.ensure_order_basket_for_wms_pick",
        lambda db, cart, order: None,
    )
    picked = {12340: 3.0}
    monkeypatch.setattr(
        "backend.services.wms_basket_put.resolve.sum_pick_events_for_line_cart",
        lambda _db, oi_id, _cid: float(picked.get(int(oi_id), 0.0)),
    )
    calls = []

    def record_pick_fn(*, quantity: float, fixed_order_id=None, scope_order_id=None):
        calls.append(float(quantity))
        oid = int(scope_order_id or 1234)
        picked[oid * 10] = float(picked.get(oid * 10, 0.0)) + float(quantity)
        return oid, oid * 10

    ok = confirm_basket_put(
        db,
        cart=cart,
        basket_scan="brck1-B01",
        operator_user_id=1,
        record_pick_fn=record_pick_fn,
        order_ids=[1234, 1235],
        product_id=192,
        location_id=LOC_A,
        quantity=1,
    )
    assert float(ok.quantity_put) == 1.0
    with pytest.raises(BasketPutError) as ei:
        confirm_basket_put(
            db,
            cart=cart,
            basket_scan="brck1-B01",
            operator_user_id=1,
            record_pick_fn=record_pick_fn,
            order_ids=[1234, 1235],
            product_id=192,
            location_id=LOC_A,
            quantity=2,
        )
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK


def test_case5_finalized_picks_not_double_reserved(db):
    now = datetime.utcnow()
    _seed_cart(db, now)
    # Physical already reflects finalized deduction: started 10, finalized took 6 → 4 on hand
    _set_stock(db, loc_a=4.0, loc_b=0.0)
    done = _add_draft_pick(db, location_id=LOC_A, quantity=6.0)
    done.picked_at = now
    done.status = "done"
    db.commit()
    # Only draft pending=0 → effective = physical 4
    avail = effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
    )
    assert avail == 4.0
    # Add draft 3 → effective 1
    _add_draft_pick(db, location_id=LOC_A, quantity=3.0)
    avail2 = effective_pickable_qty_at_location(
        db, tenant_id=1, warehouse_id=1, product_id=192, location_id=LOC_A, for_update=False
    )
    assert avail2 == 1.0


def test_case7_shortage_line_does_not_enter_inventory_consume(db):
    """Order #1235 has shortage=1, picked=0 — no Pick for shortage; only physical picks consume."""
    now = datetime.utcnow()
    _seed_cart(db, now)
    _set_stock(db, loc_a=8.0, loc_b=0.0)
    _add_draft_pick(db, location_id=LOC_A, quantity=8.0, order_id=1234)
    # No pick for order 1235 shortage
    _run_finalize_inventory_loop(db)
    db.commit()
    assert _inv(db, LOC_A) == 0.0
    oi_short = db.get(OrderItem, 12350)
    assert float(oi_short.wms_picking_line_missing_qty) == 1.0
