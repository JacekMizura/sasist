"""
Cartless picking: stock gate at pick + finalize inventory consistency + Activity.

  python -m pytest backend/tests/test_wms_cartless_picking_stock_finalize.py -q
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
from backend.models.wms_order_event import EVT_PICKING_FINISHED, EVT_WMS_PICKING_FINALIZE_FAILED, WmsOrderEvent
from backend.services.stock_disposition import STOCK_DISPOSITION_SALEABLE
from backend.services.wms_audit_service import (
    correlation_for_picking_finalize_failure,
    emit_wms_picking_finalize_failed,
    emit_wms_picking_finished,
)
from backend.services.wms_basket_put import error_codes as ec
from backend.services.wms_basket_put.scan_service import BasketPutError
from backend.services.wms_cartless_picking.finalize_service import finalize_cartless_picking_session
from backend.services.wms_cartless_picking.pick_service import record_cartless_quick_pick
from backend.services.wms_picking_product_list_service import PickingFinalizeError


LOC_ID = 501
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
def _patch_cartless_deps(monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service._allowed_pick_location_ids_for_product",
        lambda *a, **k: {LOC_ID},
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.get_or_create_wms_picking_terminal_settings",
        lambda *a, **k: type("T", (), {"allow_reserve_location_picking": True})(),
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_terminal_settings_service.resolve_gates_from_terminal_row",
        lambda *a, **k: type("G", (), {"require_product_scan": False, "require_location_scan": False})(),
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
        "backend.services.wms_cartless_picking.finalize_service.ensure_open_issue_task_for_order",
        lambda *a, **k: None,
    )
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.mark_pick_events_finalized_for_pick_ids",
        lambda *a, **k: None,
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
        "backend.services.wms_picking_product_list_service.required_disposition_for_order_item",
        lambda *a, **k: STOCK_DISPOSITION_SALEABLE,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_product_list_service._apply_pick_lot_slices",
        lambda db, pick, slices, **k: [pick],
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_atp.reserved_qty_at_lot_excluding_sales_order",
        lambda *a, **k: 0.0,
    )
    monkeypatch.setattr(
        "backend.services.wms_picking_atp.reserved_qty_at_location",
        lambda *a, **k: 0.0,
    )


def _session(db, *, operator_user_id: int = 9) -> WmsOperationSession:
    from backend.services.cart_picking_lifecycle_service import SESSION_KIND_PICKING_ACTIVE

    sess = WmsOperationSession(
        tenant_id=1,
        warehouse_id=1,
        cart_id=None,
        operator_user_id=int(operator_user_id),
        session_kind=SESSION_KIND_PICKING_ACTIVE,
        started_at=datetime.utcnow(),
        last_activity_at=datetime.utcnow(),
    )
    db.add(sess)
    db.flush()
    return sess


def _order_with_line(db, *, session_id: int, qty: float = 1.0) -> Order:
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
    db.add(OrderItem(order_id=int(o.id), product_id=PROD_ID, quantity=float(qty)))
    db.flush()
    return o


def _stock(db, *, qty: float) -> Inventory:
    inv = Inventory(
        tenant_id=1,
        warehouse_id=1,
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=float(qty),
        stock_disposition=STOCK_DISPOSITION_SALEABLE,
    )
    db.add(inv)
    db.flush()
    return inv


def test_pick_1_of_1_with_stock_1_finalize_success(db, monkeypatch):
    finished: list[int] = []

    def _cap_finished(db, **kwargs):
        finished.append(int(kwargs["order"].id))
        emit_wms_picking_finished(db, **kwargs)

    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.emit_wms_picking_finished",
        _cap_finished,
    )
    sess = _session(db)
    order = _order_with_line(db, session_id=int(sess.id))
    inv = _stock(db, qty=1.0)
    db.commit()

    record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="single",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    picks = db.query(Pick).filter(Pick.order_id == int(order.id)).all()
    assert len(picks) == 1
    assert float(picks[0].quantity) == 1.0
    assert picks[0].picked_at is None

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
    db.refresh(inv)
    assert float(inv.quantity) == 0.0
    db.refresh(picks[0])
    assert picks[0].status == "done"
    assert picks[0].picked_at is not None
    assert finished == [int(order.id)]
    ev = (
        db.query(WmsOrderEvent)
        .filter(
            WmsOrderEvent.order_id == int(order.id),
            WmsOrderEvent.event_type == EVT_PICKING_FINISHED,
        )
        .first()
    )
    assert ev is not None
    assert ev.operator_user_id == 9


def test_pick_blocked_when_location_stock_zero(db):
    sess = _session(db)
    _order_with_line(db, session_id=int(sess.id))
    _stock(db, qty=0.0)
    db.commit()

    with pytest.raises(BasketPutError) as ei:
        record_cartless_quick_pick(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            order_type="single",
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=1.0,
            picking_session_id=int(sess.id),
            operator_user_id=9,
        )
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    assert db.query(Pick).count() == 0


def test_picked_then_stock_drops_finalize_conflict_and_rollback(db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.finalize_service.emit_wms_picking_finished",
        lambda *a, **k: None,
    )
    sess = _session(db)
    order = _order_with_line(db, session_id=int(sess.id))
    inv = _stock(db, qty=1.0)
    db.commit()

    record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="single",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    db.commit()
    # Race / external correction after soft pick hold.
    inv.quantity = 0.0
    db.commit()

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
    err = ei.value
    assert err.http_status == 409
    assert err.code == "inventory_finalize_failed"
    detail = err.as_detail()
    assert detail["product_id"] == PROD_ID
    assert detail["product_name"] == "Bruder Ładowarka przegubowa Caterpillar 2"
    assert detail["sku"] == "BR-02141"
    assert detail["location_code"] == "B1:A-1"
    assert float(detail["required_qty"]) == 1.0
    assert float(detail["available_qty"]) == 0.0
    assert "Bruder" in str(err)
    assert "B1:A-1" in str(err)

    db.rollback()
    db.refresh(sess)
    assert sess.completed_at is None
    pick = db.query(Pick).filter(Pick.order_id == int(order.id)).one()
    assert pick.picked_at is None
    assert pick.status == "picking"
    assert float(pick.quantity) == 1.0
    db.refresh(inv)
    assert float(inv.quantity) == 0.0  # no partial / negative bookkeeping


def test_finalize_failure_activity_idempotent_actor(db):
    sess = _session(db, operator_user_id=9)
    order = _order_with_line(db, session_id=int(sess.id))
    db.commit()

    kwargs = dict(
        tenant_id=1,
        warehouse_id=1,
        order_id=int(order.id),
        operator_user_id=9,
        picking_session_id=int(sess.id),
        product_id=PROD_ID,
        product_name="Bruder Ładowarka przegubowa Caterpillar 2",
        sku="BR-02141",
        ean="4001702082141",
        location_id=LOC_ID,
        location_code="B1:A-1",
        required_qty=1.0,
        available_qty=0.0,
        error_code="inventory_finalize_failed",
    )
    emit_wms_picking_finalize_failed(db, **kwargs)
    emit_wms_picking_finalize_failed(db, **kwargs)
    db.commit()

    rows = (
        db.query(ActivityEvent)
        .filter(ActivityEvent.event_code == EVT_WMS_PICKING_FINALIZE_FAILED)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].severity == "ERROR"
    assert rows[0].actor_user_id == 9
    assert rows[0].description == "Nie udało się zakończyć zbierania."
    corr = correlation_for_picking_finalize_failure(
        picking_session_id=int(sess.id),
        order_id=int(order.id),
        product_id=PROD_ID,
        location_id=LOC_ID,
    )
    assert rows[0].correlation_id == corr
    wms_rows = (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.event_type == EVT_WMS_PICKING_FINALIZE_FAILED)
        .all()
    )
    # Second emit short-circuits before another wms_order_event.
    assert len(wms_rows) == 1
    assert wms_rows[0].operator_user_id == 9


def test_two_orders_cannot_overclaim_same_location_unit(db):
    """Concurrency-safe soft hold: second cartless pick at same loc blocked by pending."""
    sess = _session(db)
    o1 = _order_with_line(db, session_id=int(sess.id))
    o2 = Order(
        tenant_id=1,
        warehouse_id=1,
        number="1277",
        status="PICKING",
        order_ui_status_id=6,
        fulfillment_state="PICKING",
        cart_id=None,
        picking_session_id=int(sess.id),
        picking_started_at=datetime.utcnow(),
    )
    db.add(o2)
    db.flush()
    db.add(OrderItem(order_id=int(o2.id), product_id=PROD_ID, quantity=1.0))
    _stock(db, qty=1.0)
    db.commit()

    record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="all",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    db.flush()
    # Remaining line still open on o2, but effective stock is 0 after o1 draft.
    with pytest.raises(BasketPutError) as ei:
        record_cartless_quick_pick(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            order_type="all",
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=1.0,
            picking_session_id=int(sess.id),
            operator_user_id=9,
        )
    assert ei.value.code == ec.QUANTITY_EXCEEDS_LOCATION_STOCK
    assert db.query(Pick).count() == 1
    assert int(db.query(Pick).one().order_id) == int(o1.id)


def test_quick_pick_uses_explicit_location_id_on_pick(db):
    """Regression: Pick.location_id must equal request location_id (SSOT)."""
    sess = _session(db)
    _order_with_line(db, session_id=int(sess.id))
    _stock(db, qty=2.0)
    db.commit()

    oid, oiid = record_cartless_quick_pick(
        db,
        tenant_id=1,
        warehouse_id=1,
        source_status_id=6,
        order_type="single",
        product_id=PROD_ID,
        location_id=LOC_ID,
        quantity=1.0,
        picking_session_id=int(sess.id),
        operator_user_id=9,
    )
    assert oid > 0 and oiid > 0
    pick = db.query(Pick).one()
    assert int(pick.location_id) == LOC_ID


def test_wrong_location_not_in_allowed_raises_wrong_location(db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_cartless_picking.pick_service._allowed_pick_location_ids_for_product",
        lambda *a, **k: {LOC_ID},
    )
    sess = _session(db)
    _order_with_line(db, session_id=int(sess.id))
    _stock(db, qty=1.0)
    db.commit()
    other_loc = 999
    with pytest.raises(BasketPutError) as ei:
        record_cartless_quick_pick(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            order_type="single",
            product_id=PROD_ID,
            location_id=other_loc,
            quantity=1.0,
            picking_session_id=int(sess.id),
            operator_user_id=9,
        )
    assert ei.value.code == ec.WRONG_LOCATION_SCAN
    assert db.query(Pick).count() == 0


def test_no_open_quantity_is_structured_not_unknown(db):
    sess = _session(db)
    order = _order_with_line(db, session_id=int(sess.id), qty=1.0)
    # Line already fully covered by a draft pick (remaining = 0).
    db.add(
        Pick(
            tenant_id=1,
            warehouse_id=1,
            order_id=int(order.id),
            order_item_id=int(order.items[0].id),
            product_id=PROD_ID,
            location_id=LOC_ID,
            cart_id=None,
            quantity=1.0,
            picked_at=None,
            status="picking",
        )
    )
    _stock(db, qty=5.0)
    db.commit()

    with pytest.raises(BasketPutError) as ei:
        record_cartless_quick_pick(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            order_type="single",
            product_id=PROD_ID,
            location_id=LOC_ID,
            quantity=1.0,
            picking_session_id=int(sess.id),
            operator_user_id=9,
        )
    assert ei.value.code == ec.NO_OPEN_QUANTITY
    assert ei.value.code != ec.UNKNOWN_SCAN_CODE
