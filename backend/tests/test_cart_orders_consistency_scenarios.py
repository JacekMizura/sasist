"""
Full carts consistency audit — scenarios A–E.

Asserts identical order counts across:
  list_orders_on_cart / compute_cart_stats / CartCapacityEngine.from_db /
  CartLifecycleService task total_orders / Activity (lifecycle) event metadata.

  python -m pytest backend/tests/test_cart_orders_consistency_scenarios.py -q
"""

from __future__ import annotations

import json
from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_capacity.engine import CartCapacityEngine
from backend.services.cart_picking_lifecycle_service import (
    admin_release_cart,
    claim_cart,
    finish_picking,
    get_cart_current_task,
    get_cart_status,
    release_stale_assigned_carts,
    start_picking,
)
from backend.services.cart_stats_service import (
    compute_cart_stats,
    list_orders_on_cart,
    orders_event_meta,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Cart,
        CartBasket,
        Order,
        OrderItem,
        Product,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        ActivityEvent,
        ActivityEventLink,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _cart(db) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="WOZ-AUDIT",
        code="CART-AUDIT",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=20,
    )
    db.add(c)
    db.flush()
    return c


def _orders(db, n: int = 5) -> list[Order]:
    out = []
    for i in range(1, n + 1):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=f"ORD-{i}",
            status="NEW",
            fulfillment_state=None,
            fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
            total_volume_dm3=1.0,
        )
        db.add(o)
        out.append(o)
    db.flush()
    return out


def _event_meta(row: CartLifecycleEvent) -> dict:
    raw = getattr(row, "metadata_json", None)
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    return json.loads(raw)


def _assert_counts_equal(db, cart: Cart, expected: int, *, label: str) -> list[Order]:
    db.refresh(cart)
    ssot = list_orders_on_cart(db, cart)
    stats = compute_cart_stats(db, cart)
    cap = CartCapacityEngine.from_db(db, cart).snapshot()
    task = get_cart_current_task(db, cart, enrich=False)
    task_orders = int(task["total_orders"]) if task and "total_orders" in task else None

    assert len(ssot) == expected, f"{label}: SSOT={len(ssot)} expected={expected}"
    assert int(stats["orders_count"]) == expected, f"{label}: stats={stats['orders_count']}"
    assert int(cap.assigned_orders) == expected, f"{label}: capacity={cap.assigned_orders}"
    if task_orders is not None and expected > 0 and get_cart_status(cart) == CartStatus.PICKING:
        assert task_orders == expected, f"{label}: WMS task={task_orders}"
    return ssot


def _assert_assign_event_has_order_numbers(db, cart: Cart, expected_numbers: set[str]) -> None:
    rows = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "orders_assigned",
        )
        .order_by(CartLifecycleEvent.id.desc())
        .all()
    )
    assert rows, "missing orders_assigned event"
    latest = rows[0]
    meta = _event_meta(latest)
    nums = {str(x) for x in (meta.get("order_numbers") or [])}
    assert nums == expected_numbers, f"order_numbers={nums} expected={expected_numbers}"
    assert int(meta.get("orders_count") or 0) == len(expected_numbers)
    assert latest.operator_user_id is not None
    assert latest.occurred_at is not None
    desc = str(latest.description or "")
    assert "Przypisano" in desc
    assert str(len(expected_numbers)) in desc or f"{len(expected_numbers)}" in desc
    # Activity Log: count result; full numbers live in metadata (capped) / Capacity Analytics
    meta_nums = {str(x) for x in (meta.get("order_numbers") or [])}
    assert meta_nums == expected_numbers or meta.get("orders_count") == len(expected_numbers)


def test_scenarios_a_through_e_order_count_ssot(db):
    cart = _cart(db)
    batch1 = _orders(db, 5)
    numbers = {o.number for o in batch1}
    db.commit()

    # --- A: assign 5 to empty cart ---
    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=batch1, operator_user_id=7)
    db.commit()
    _assert_counts_equal(db, cart, 5, label="A")
    _assert_assign_event_has_order_numbers(db, cart, numbers)
    assert get_cart_status(cart) == CartStatus.PICKING

    # --- B: admin detach ---
    out = admin_release_cart(
        db,
        cart_id=int(cart.id),
        tenant_id=1,
        warehouse_id=1,
        admin_user_id=99,
        acknowledge=True,
    )
    db.commit()
    assert out["orders_detached"] == 5
    _assert_counts_equal(db, cart, 0, label="B")
    assert get_cart_status(cart) == CartStatus.AVAILABLE

    detach_ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "admin_orders_detached",
        )
        .order_by(CartLifecycleEvent.id.desc())
        .first()
    )
    assert detach_ev is not None
    dmeta = _event_meta(detach_ev)
    assert {str(x) for x in (dmeta.get("order_numbers") or [])} == numbers
    release_ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "admin_cart_released",
        )
        .order_by(CartLifecycleEvent.id.desc())
        .first()
    )
    assert release_ev is not None
    rmeta = _event_meta(release_ev)
    assert rmeta.get("reason")
    assert {str(x) for x in (rmeta.get("order_numbers") or [])} == numbers

    # --- C: operator timeout (claim → stale → release) ---
    claim_cart(db, cart=cart, operator_user_id=7)
    cart.claimed_at = datetime.utcnow() - timedelta(minutes=45)
    db.commit()
    n = release_stale_assigned_carts(db, timeout_minutes=30)
    db.commit()
    assert n == 1
    _assert_counts_equal(db, cart, 0, label="C")
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    timeout_ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "reservation_timed_out",
        )
        .order_by(CartLifecycleEvent.id.desc())
        .first()
    )
    assert timeout_ev is not None
    assert timeout_ev.occurred_at is not None
    tmeta = _event_meta(timeout_ev)
    # No orders on cart at timeout — empty list is valid SSOT
    assert int(tmeta.get("orders_count") or 0) == 0
    assert list(tmeta.get("order_numbers") or []) == []

    # --- D: reassign 5 ---
    batch2 = []
    for i in range(1, 6):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=f"RE-{i}",
            status="NEW",
            fulfillment_state=None,
            fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
            total_volume_dm3=1.0,
        )
        db.add(o)
        batch2.append(o)
    numbers2 = {o.number for o in batch2}
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=11)
    start_picking(db, cart=cart, orders=batch2, operator_user_id=11)
    db.commit()
    _assert_counts_equal(db, cart, 5, label="D")
    _assert_assign_event_has_order_numbers(db, cart, numbers2)

    # --- E: finish picking ---
    finish_picking(db, cart=cart, orders=batch2, operator_user_id=11)
    db.commit()
    _assert_counts_equal(db, cart, 5, label="E")
    assert get_cart_status(cart) == CartStatus.READY_FOR_PACKING
    finish_ev = (
        db.query(CartLifecycleEvent)
        .filter(
            CartLifecycleEvent.cart_id == int(cart.id),
            CartLifecycleEvent.event_code == "picking_finished",
        )
        .order_by(CartLifecycleEvent.id.desc())
        .first()
    )
    assert finish_ev is not None
    fmeta = _event_meta(finish_ev)
    assert {str(x) for x in (fmeta.get("order_numbers") or [])} == numbers2
    assert int(fmeta.get("orders_count") or 0) == 5
    assert finish_ev.operator_user_id == 11
    assert finish_ev.occurred_at is not None

    # Cross-check helper parity
    assert orders_event_meta(list_orders_on_cart(db, cart))["orders_count"] == 5
