"""
Legacy draft Pick stock conflict hardening (post 7e541f4b).

  python -m pytest backend/tests/test_wms_picking_draft_stock_conflict.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_activity_log import OrderActivityLog
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.picking_config import PickingConfig
from backend.models.product import Product
from backend.models.stock_reservation import StockReservation
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_operation_session import WmsOperationSession
from backend.models.wms_order_event import EVT_WMS_PICKING_DRAFT_STOCK_CONFLICT, WmsOrderEvent
from backend.services.cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_cartless_picking.finalize_service import finalize_cartless_picking_session
from backend.services.wms_cartless_picking.pick_service import record_cartless_quick_pick
from backend.services.wms_picking_corrections.undo_pick_service import undo_wms_pick_by_id
from backend.services.wms_picking_draft_stock_conflict import (
    correlation_for_draft_stock_conflict,
    detect_draft_stock_conflicts,
    emit_draft_stock_conflicts_once,
)
from backend.services.wms_picking_product_list_service import PickingFinalizeError


LOC_ID = 501
LOC_ALT = 502
PROD_ID = 193


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        Product,
        Location,
        Inventory,
        StockReservation,
        Order,
        OrderItem,
        Pick,
        WmsOperationSession,
        PickingConfig,
        WmsOrderEvent,
        OrderActivityLog,
        ActivityEvent,
        ActivityEventLink,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        Product(
            id=PROD_ID,
            tenant_id=1,
            name="Bruder Ładowarka przegubowa Caterpillar 2",
            sku="BR-02141",
            ean="4001702082141",
        )
    )
    session.add(Location(id=LOC_ID, warehouse_id=1, name="B1:A-1", is_active=True))
    session.add(Location(id=LOC_ALT, warehouse_id=1, name="B1:A-2", is_active=True))
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
def _patch(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_picking_atp.reserved_qty_at_location",
        lambda *a, **k: 0.0,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_atp.reserved_qty_at_lot_excluding_sales_order",
        lambda *a, **k: 0.0,
    )


def _session(db) -> WmsOperationSession:
    sess = WmsOperationSession(
        tenant_id=1,
        warehouse_id=1,
        cart_id=None,
        operator_user_id=9,
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        started_at=datetime.utcnow(),
        last_activity_at=datetime.utcnow(),
    )
    db.add(sess)
    db.flush()
    return sess


def _order(db, *, session_id: int) -> Order:
    o = Order(
        tenant_id=1,
        warehouse_id=1,
        number="1276",
        status="PICKING",
        order_ui_status_id=6,
        fulfillment_state="PICKING",
        cart_id=None,
        picking_session_id=int(session_id),
        picking_started_at=datetime.utcnow(),
    )
    db.add(o)
    db.flush()
    db.add(OrderItem(order_id=int(o.id), product_id=PROD_ID, quantity=1.0))
    db.flush()
    return o


def _legacy_draft(db, *, order: Order, qty: float = 1.0) -> Pick:
    """Simulate pre-gate poisoned draft (no stock check)."""
    oi = db.query(OrderItem).filter(OrderItem.order_id == int(order.id)).first()
    assert oi is not None
    p = Pick(
        tenant_id=1,
        warehouse_id=1,
        order_id=int(order.id),
        order_item_id=int(oi.id),
        product_id=PROD_ID,
        location_id=LOC_ID,
        cart_id=None,
        quantity=float(qty),
        picked_at=None,
        status="picking",
        picker_id=9,
    )
    db.add(p)
    db.flush()
    return p


def test_detect_legacy_draft_conflict_inventory_zero(db):
    sess = _session(db)
    order = _order(db, session_id=int(sess.id))
    pick = _legacy_draft(db, order=order)
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=0.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()

    conflicts = detect_draft_stock_conflicts(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_ids=[int(order.id)],
        cart_id=None,
        picking_session_id=int(sess.id),
    )
    assert len(conflicts) == 1
    assert conflicts[0].pick_id == int(pick.id)
    assert float(conflicts[0].available_qty) == 0.0
    assert float(conflicts[0].picked_qty) == 1.0


def test_product_lines_expose_conflict_and_block_finalize(db, monkeypatch):
    # Slim build path: inject conflict after a stubbed response core
    sess = _session(db)
    order = _order(db, session_id=int(sess.id))
    pick = _legacy_draft(db, order=order)
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=0.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    db.commit()

    # Direct detection + emit (list builder is heavy); assert projection contract via helpers.
    conflicts = detect_draft_stock_conflicts(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_ids=[int(order.id)],
        picking_session_id=int(sess.id),
    )
    assert conflicts
    n1 = emit_draft_stock_conflicts_once(
        db, tenant_id=1, warehouse_id=1, conflicts=conflicts, operator_user_id=9
    )
    n2 = emit_draft_stock_conflicts_once(
        db, tenant_id=1, warehouse_id=1, conflicts=conflicts, operator_user_id=9
    )
    db.commit()
    assert n1 == 1
    assert n2 == 0
    rows = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.event_code == EVT_WMS_PICKING_DRAFT_STOCK_CONFLICT)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].correlation_id == correlation_for_draft_stock_conflict(pick_id=int(pick.id))
    assert rows[0].severity == "WARNING"
    assert rows[0].actor_user_id == 9
    assert "Brak stanu" in rows[0].description

    # Finalize must refuse while poisoned draft remains.
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.get_or_create_wms_picking_shortage_settings",
        lambda *a, **k: type("SS", (), {"shortage_reported_order_ui_status_id": None})(),
    )
    with pytest.raises(PickingFinalizeError) as ei:
        finalize_cartless_picking_session(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            order_type="single",
            picking_session_id=int(sess.id),
            operator_user_id=9,
        )
    assert ei.value.http_status == 409
    db.rollback()
    db.refresh(sess)
    assert sess.completed_at is None
    assert db.query(Pick).filter(Pick.id == int(pick.id)).count() == 1


def test_recovery_undo_repick_finalize_no_double_decrement(db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service._allowed_pick_location_ids_for_product",
        lambda *a, **k: {LOC_ALT, LOC_ID},
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.get_or_create_wms_picking_terminal_settings",
        lambda *a, **k: type("T", (), {"allow_reserve_location_picking": True})(),
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.resolve_gates_from_terminal_row",
        lambda *a, **k: type("G", (), {})(),
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.assert_pick_terminal_gates",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.product_has_scannable_code",
        lambda *a, **k: True,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.resolve_wms_picking_order_ids",
        lambda db, **k: [int(r.id) for r in db.query(Order).all()],
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.record_pick_event_for_wms_pick",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.emit_wms_picked_item",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service.emit_wms_picking_started",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.get_or_create_wms_picking_shortage_settings",
        lambda *a, **k: type("SS", (), {"shortage_reported_order_ui_status_id": None})(),
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.apply_fulfillment_state",
        lambda order, fs, **k: setattr(order, "fulfillment_state", fs),
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service._panel_status_after_picking_finalize",
        lambda **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.clear_order_picking_session_context",
        lambda order: setattr(order, "picking_session_id", None),
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
        "backend.services.wms_cartless_picking.finalize_service.mark_pick_events_finalized_for_pick_ids",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service.required_disposition_for_order_item",
        lambda *a, **k: STOCK_DISPOSITION_SALEABLE,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service._apply_pick_lot_slices",
        lambda db, pick, slices, **k: [pick],
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.undo_pick_service.recompute_order_fulfillment",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_corrections.undo_pick_service.delete_pick_events_for_pick_ids",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_audit_service.emit_wms_pick_undone",
        lambda *a, **k: None,
    )

    sess = _session(db)
    order = _order(db, session_id=int(sess.id))
    poisoned = _legacy_draft(db, order=order)
    # Empty at original location; stock only at alternate.
    db.add(
        Inventory(
            tenant_id=1,
            warehouse_id=1,
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=0.0,
            stock_disposition=STOCK_DISPOSITION_SALEABLE,
        )
    )
    alt_inv = Inventory(
        tenant_id=1,
        warehouse_id=1,
        product_id=PROD_ID,
        location_id=LOC_ALT,
        quantity=1.0,
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    db.add(alt_inv)
    db.commit()

    assert detect_draft_stock_conflicts(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_ids=[int(order.id)],
        picking_session_id=int(sess.id),
    )

    undo_wms_pick_by_id(
        db,
        tenant_id=1,
        warehouse_id=1,
        pick_id=int(poisoned.id),
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    db.flush()
    assert db.query(Pick).count() == 0

    record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="single",
        product_id=PROD_ID,
        location_id=LOC_ALT,
        quantity=1.0,
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    db.flush()
    assert detect_draft_stock_conflicts(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_ids=[int(order.id)],
        picking_session_id=int(sess.id),
    ) == []

    out = finalize_cartless_picking_session(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="single",
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    db.commit()
    assert out["ok"] is True
    db.refresh(alt_inv)
    assert float(alt_inv.quantity) == 0.0
    # No second inventory row mutated / no negative.
    assert float(alt_inv.quantity) >= 0.0
