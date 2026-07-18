"""Capacity Analytics — aggregates + lazy details, not Activity Log.

  python -m pytest backend/tests/test_capacity_analytics.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.capacity_analytics import (
    CapacityAnalyticsDetail,
    CapacityAnalyticsReasonAgg,
    CapacityAnalyticsRun,
)
from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_capacity.analytics_service import (
    get_latest_run_for_cart,
    list_order_capacity_history,
    list_reason_order_details,
    persist_capacity_run,
    warehouse_stats_24h,
)
from backend.services.cart_picking_lifecycle_service import claim_cart, start_picking


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Cart,
        CartBasket,
        Order,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        CapacityAnalyticsRun,
        CapacityAnalyticsReasonAgg,
        CapacityAnalyticsDetail,
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


def _cart(db, *, capacity_orders=2) -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name="120X80",
        code="CART-CAP",
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_ORDERS",
        capacity_orders=capacity_orders,
    )
    db.add(c)
    db.flush()
    return c


def _orders(db, n: int) -> list[Order]:
    out = []
    for i in range(1, n + 1):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=f"C-{i}",
            status="NEW",
            fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
            total_volume_dm3=1.0,
        )
        db.add(o)
        out.append(o)
    db.flush()
    return out


def test_start_picking_writes_capacity_analytics_not_skip_activity(db):
    cart = _cart(db, capacity_orders=2)
    orders = _orders(db, 5)
    db.commit()
    claim_cart(db, cart=cart, operator_user_id=7)
    start_picking(db, cart=cart, orders=orders, operator_user_id=7, on_capacity="truncate")
    db.commit()

    run = get_latest_run_for_cart(db, cart_id=int(cart.id))
    assert run is not None
    assert run["candidates_count"] == 5
    assert run["assigned_count"] == 2
    assert run["rejected_count"] == 3
    assert any(r["reason_code"] == "orders_limit" for r in run["reasons"])

    # Lifecycle Event Log: operation results only (no Pominięto / capacity_blocked spam)
    ev_codes = [
        str(e.event_code)
        for e in db.query(CartLifecycleEvent)
        .filter(CartLifecycleEvent.cart_id == int(cart.id))
        .all()
    ]
    assert "orders_assigned" in ev_codes or "picking_started" in ev_codes
    assert "capacity_blocked" not in ev_codes
    assert "basket_assigned" not in ev_codes
    descs = " ".join(
        str(e.description or "")
        for e in db.query(CartLifecycleEvent)
        .filter(CartLifecycleEvent.cart_id == int(cart.id))
        .all()
    )
    assert "Pominięto" not in descs

    page = list_reason_order_details(
        db, run_id=int(run["run_id"]), reason_code="orders_limit", offset=0, limit=2
    )
    assert page["total"] == 3
    assert len(page["items"]) == 2
    assert page["has_more"] is True

    hist = list_order_capacity_history(db, order_id=int(orders[4].id))
    assert hist
    assert hist[0]["result"] == "rejected"
    assert hist[0]["cart_label"]


def test_persist_and_stats(db):
    cart = _cart(db)
    assigned = []
    for i in range(1, 3):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=f"A-{i}",
            status="NEW",
            fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
            total_volume_dm3=1.0,
        )
        db.add(o)
        assigned.append(o)
    rejected_orders = []
    for i in range(1, 4):
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number=f"RJ-{i}",
            status="NEW",
            fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
            total_volume_dm3=1.0,
        )
        db.add(o)
        rejected_orders.append(o)
    db.commit()
    persist_capacity_run(
        db,
        cart=cart,
        source="start_picking",
        strategy="LIMIT_ORDERS",
        operator_user_id=1,
        assigned=assigned,
        rejected=[(o, "volume_limit") for o in rejected_orders],
        occurred_at=datetime.utcnow(),
    )
    db.commit()
    stats = warehouse_stats_24h(db, tenant_id=1, warehouse_id=1, hours=24)
    assert stats["assigned_count"] == 2
    assert stats["rejected_count"] == 3
    assert stats["top_reasons"][0]["reason_code"] == "volume_limit"
