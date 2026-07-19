"""
CARTLESS PICKING (bulk / cart_no_scan) — CASE 1–12 (rdzeń BE).

  python -m pytest backend/tests/test_wms_cartless_picking_ssot.py -q
"""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.cart import Cart
from backend.models.cart_basket import CartBasket
from backend.models.cart_lifecycle_event import CartLifecycleEvent
from backend.models.cart_lifecycle_history import CartLifecycleHistory
from backend.models.enums import CartStatus, CartType
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.services.cart_picking_lifecycle_service import get_cart_status
from backend.services.wms_cartless_picking import (
    cancel_cartless_picking_session,
    finalize_cartless_picking_session,
    start_cartless_picking,
)
from backend.services.wms_cartless_picking.cancel_service import release_stale_cartless_sessions
from backend.services.wms_cartless_picking.scope import list_order_ids_on_picking_session
from backend.services.wms_picking_product_list_service import (
    bootstrap_start_picking_if_needed,
    resolve_wms_picking_order_ids,
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
        Pick,
        WmsOperationSession,
        CartLifecycleHistory,
        CartLifecycleEvent,
        PickingConfig,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        PickingConfig(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            target_status_id=7,
            strategy="by_products",
            single_mode="bulk",
            multi_mode="bulk",
            max_single_orders=50,
            max_multi_orders=50,
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture(autouse=True)
def _bypass_gate(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_order_validation.gate.gate_orders_before_capacity",
        lambda db, *, orders, tenant_id, warehouse_id, operator_user_id=None: list(orders),
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.start_service.gate_orders_before_capacity",
        lambda db, *, orders, tenant_id, warehouse_id, operator_user_id=None: list(orders),
    )

    def _simple_query(db, *, tenant_id, warehouse_id, source_status_id, order_type):
        rows = (
            db.query(Order.id)
            .filter(
                Order.tenant_id == int(tenant_id),
                Order.warehouse_id == int(warehouse_id),
                Order.order_ui_status_id == int(source_status_id),
                Order.deleted_at.is_(None),
                Order.cart_id.is_(None),
            )
            .order_by(Order.id.asc())
            .all()
        )
        return [int(r[0]) for r in rows]

    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.start_service._query_order_ids_for_status",
        _simple_query,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service._query_order_ids_for_status",
        _simple_query,
    )
    monkeypatch.setattr(
        "backend.services.order_fulfillment_recompute.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.get_or_create_wms_picking_shortage_settings",
        lambda db, *, tenant_id, warehouse_id: type(
            "SS",
            (),
            {"shortage_reported_order_ui_status_id": None},
        )(),
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.emit_wms_picking_finished",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.ensure_open_issue_task_for_order",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service._decrement_inventory_for_wms_pick",
        lambda *a, **k: [],
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.apply_fulfillment_state",
        lambda order, fs, **k: setattr(order, "fulfillment_state", fs),
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service._panel_status_after_picking_finalize",
        lambda **k: 7,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.mark_pick_events_finalized_for_pick_ids",
        lambda *a, **k: None,
    )


def _cart(db, *, code: str = "CART-0001") -> Cart:
    c = Cart(
        tenant_id=1,
        warehouse_id=1,
        name=code,
        code=code,
        type=CartType.BULK,
        status=CartStatus.AVAILABLE.value,
        length=100,
        width=60,
        height=80,
        total_volume=480.0,
        used_volume=0.0,
        capacity_strategy="LIMIT_VOLUME",
        capacity_orders=50,
    )
    db.add(c)
    db.flush()
    return c


def _order(db, *, number: str, status_id: int = 6) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number=number,
        status="NEW",
        order_ui_status_id=status_id,
        fulfillment_state=None,
        fulfillment_assignment_phase="FULFILLMENT_ASSIGNED",
        cart_id=None,
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=int(o.id), product_id=1, quantity=1))
    db.flush()
    return o


def test_case1_cartless_start_null_cart_ids(db):
    cart = _cart(db)
    for i in range(3):
        _order(db, number=f"CL-{i}")
    db.commit()

    sess, msg = start_cartless_picking(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        operator_user_id=10,
    )
    db.commit()
    assert sess is not None
    assert sess.cart_id is None
    assert msg is None

    orders = db.query(Order).filter(Order.picking_session_id == int(sess.id)).all()
    assert len(orders) >= 1
    for o in orders:
        assert o.cart_id is None
        assert int(o.picking_session_id) == int(sess.id)

    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert float(cart.used_volume or 0) == 0.0


def test_case2_physical_cart_scan_still_claims(db, monkeypatch):
    """Regression guard: cart_scan path nadal claimuje WarehouseCart (nie cartless)."""
    from sqlalchemy import func, or_

    def _simple_eligibility(*_a, **_k):
        return (
            Order.picking_finished_at.is_(None),
            Order.deleted_at.is_(None),
            or_(
                Order.fulfillment_state.is_(None),
                func.trim(Order.fulfillment_state) == "",
                Order.fulfillment_state.in_(("PICKING", "PARTIAL")),
            ),
        )

    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service._picking_queue_eligibility_clauses",
        _simple_eligibility,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_assign_trace.order_eligible_for_wms_queues",
        lambda *a, **k: True,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_assign_trace.assert_order_wms_fulfillment_not_blocked",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_assign_trace.validate_orders_for_picking",
        lambda *a, **k: [],
    )

    cart = _cart(db)
    _order(db, number="PHYS-1")
    db.commit()

    sess, _ = bootstrap_start_picking_if_needed(
        db,
        tenant_id=1,
        warehouse_id=1,
        cart_id=int(cart.id),
        source_status_id=6,
        order_type="all",
        operator_user_id=10,
    )
    db.commit()
    assert sess is not None
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.PICKING
    o = db.query(Order).filter(Order.number == "PHYS-1").one()
    assert o.cart_id == int(cart.id)


def test_case4_multi_operator_isolation(db):
    # Limit 2 → operator A bierze 2, B bierze pozostałe 2.
    pc = db.query(PickingConfig).filter(PickingConfig.warehouse_id == 1).one()
    pc.max_single_orders = 2
    pc.max_multi_orders = 2
    db.add(pc)
    for i in range(4):
        _order(db, number=f"MO-{i}")
    db.commit()

    sa, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=1
    )
    db.flush()
    sb, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=2
    )
    db.commit()
    assert sa is not None and sb is not None
    assert int(sa.id) != int(sb.id)

    ids_a = set(list_order_ids_on_picking_session(db, session_id=int(sa.id)))
    ids_b = set(list_order_ids_on_picking_session(db, session_id=int(sb.id)))
    assert ids_a.isdisjoint(ids_b)
    assert ids_a and ids_b


def test_case5_finalize_keeps_cart_null(db):
    _order(db, number="FIN-1")
    db.commit()
    sess, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=5
    )
    db.flush()
    assert sess is not None
    cart = _cart(db, code="CART-KEEP")
    vol_before = float(cart.used_volume or 0)

    out = finalize_cartless_picking_session(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        picking_session_id=int(sess.id),
        operator_user_id=5,
    )
    db.commit()
    assert out["ok"] is True
    assert out["cart_id"] is None
    db.refresh(sess)
    assert sess.completed_at is not None
    o = db.query(Order).filter(Order.number == "FIN-1").one()
    assert o.cart_id is None
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE
    assert float(cart.used_volume or 0) == vol_before


def test_case6_shortage_no_cart_detach(db, monkeypatch):
    calls = {"detach": 0, "release": 0}

    def _no_detach(*_a, **_k):
        calls["detach"] += 1
        raise AssertionError("detach must not run in cartless shortage")

    def _no_release(*_a, **_k):
        calls["release"] += 1
        raise AssertionError("release must not run in cartless shortage")

    monkeypatch.setattr(
        "backend.services.cart_picking_lifecycle_service.detach_order_from_cart",
        _no_detach,
        raising=False,
    )
    monkeypatch.setattr(
        "backend.services.cart_picking_lifecycle_service.release_cart",
        _no_release,
        raising=False,
    )

    o = _order(db, number="SH-1")
    db.commit()
    sess, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=7
    )
    db.flush()
    assert sess is not None
    oi = db.query(OrderItem).filter(OrderItem.order_id == int(o.id)).one()
    oi.wms_picking_line_missing_qty = 1.0
    oi.wms_picking_line_status = "missing"
    db.add(oi)
    db.commit()

    out = finalize_cartless_picking_session(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        picking_session_id=int(sess.id),
        operator_user_id=7,
    )
    db.commit()
    assert out["ok"] is True
    assert calls["detach"] == 0
    assert calls["release"] == 0
    db.refresh(o)
    assert o.cart_id is None


def test_case7_cancel_releases_session_lock(db):
    _order(db, number="CAN-1")
    db.commit()
    sess, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=8
    )
    db.flush()
    assert sess is not None
    sid = int(sess.id)
    cancel_cartless_picking_session(
        db, tenant_id=1, warehouse_id=1, session_id=sid, operator_user_id=8
    )
    db.commit()
    o = db.query(Order).filter(Order.number == "CAN-1").one()
    assert o.picking_session_id is None
    assert o.cart_id is None
    db.refresh(sess)
    assert sess.completed_at is not None


def test_case8_timeout_releases_stale(db):
    _order(db, number="TO-1")
    db.commit()
    sess, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=9
    )
    db.flush()
    assert sess is not None
    sess.last_activity_at = datetime.utcnow() - timedelta(minutes=120)
    db.add(sess)
    db.commit()

    n = release_stale_cartless_sessions(db, idle_minutes=45)
    db.commit()
    assert n >= 1
    o = db.query(Order).filter(Order.number == "TO-1").one()
    assert o.picking_session_id is None


def test_case11_invariants_during_lifecycle(db):
    cart = _cart(db)
    _order(db, number="INV-1")
    db.commit()
    sess, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=11
    )
    db.flush()
    assert sess is not None and sess.cart_id is None
    o = db.query(Order).filter(Order.number == "INV-1").one()
    assert o.cart_id is None
    ids = resolve_wms_picking_order_ids(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        picking_session_id=int(sess.id),
    )
    assert int(o.id) in ids
    db.refresh(cart)
    assert get_cart_status(cart) == CartStatus.AVAILABLE


def test_case12_race_order_single_session(db):
    o = _order(db, number="RACE-1")
    db.commit()
    sa, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=21
    )
    db.flush()
    sb, _ = start_cartless_picking(
        db, tenant_id=1, warehouse_id=1, source_status_id=6, order_type="all", operator_user_id=22
    )
    db.commit()
    assert sa is not None
    db.refresh(o)
    assert o.picking_session_id == int(sa.id)
    # Drugi start nie może przejąć już claimowanego orderu
    if sb is not None:
        assert int(o.picking_session_id) != int(sb.id) or list_order_ids_on_picking_session(
            db, session_id=int(sb.id)
        ) == []
    assert o.cart_id is None
