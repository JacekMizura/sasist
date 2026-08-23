"""Order Activity — WMS pick aggregates, carton, automation presentation.

  python -m pytest backend/tests/test_order_activity_wms_automation_details.py -q
"""

from __future__ import annotations

from datetime import datetime

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.activity_event import ActivityEvent, ActivityEventLink
from backend.models.app_user import AppUser
from backend.models.automation import (
    AutomationEffect,
    AutomationEffectExecution,
    AutomationExecution,
    AutomationRule,
    StatusTransitionEvent,
)
from backend.models.carton import Carton, carton_shipping_method_links
from backend.models.location import Location
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.pick import Pick
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_event import EVT_PICKED_ITEM, WmsOrderEvent
from backend.models.order_ui_status import OrderUiStatus
from backend.models.wms_packing_session import WmsPackingSession
from backend.services.activity_log.automation_activity_presentation import (
    build_automation_activity_presentation,
    format_automation_activity_summary,
    humanize_automation_blocked_reason,
)
from backend.services.activity_log.order_activity import emit_automation_execution_activity
from backend.services.activity_log.order_event_codes import AUTOMATION_BLOCKED
from backend.services.activity_log.order_presentation import (
    apply_wms_prefix,
    build_order_inline_detail_rows,
)
from backend.services.activity_log.picking_activity_projection import (
    EVT_PICK_AGGREGATE,
    emit_picking_pick_aggregates_to_activity,
)
from backend.services.activity_log.service import list_activity_for_object
from backend.services.automation.constants import EXEC_BLOCKED
from backend.services.wms_audit_service import (
    emit_wms_carton_selected_or_changed,
    emit_wms_matching_outcome,
    emit_wms_packing_finished,
    emit_wms_picked_item,
    emit_wms_picking_finished,
)


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        AppUser,
        Product,
        Location,
        Carton,
        OrderUiStatus,
        Order,
        OrderItem,
        Pick,
        WmsOrderEvent,
        WmsPackingSession,
        ActivityEvent,
        ActivityEventLink,
        StatusTransitionEvent,
        AutomationRule,
        AutomationEffect,
        AutomationExecution,
        AutomationEffectExecution,
    ):
        model.__table__.create(engine, checkfirst=True)
    carton_shipping_method_links.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH"))
    session.add(
        AppUser(
            id=7,
            login="admin",
            email="a@x",
            password_hash="x",
            first_name="Super",
            last_name="Admin",
            is_active=True,
        )
    )
    session.add(
        Product(id=101, tenant_id=1, name="Sznurówadła CAT 100 cm", sku="ST-001", ean="5905450181185")
    )
    session.add(
        Product(
            id=102,
            tenant_id=1,
            name="Bruder Ładowarka przegubowa Caterpillar 2",
            sku="BR-002",
            ean="4001702024402",
        )
    )
    session.add(Location(id=11, warehouse_id=1, name="A1-A-1", is_active=True))
    session.add(Location(id=12, warehouse_id=1, name="B1-A-1", is_active=True))
    session.add(
        Carton(
            id="c-a",
            tenant_id=1,
            warehouse_id=1,
            name="Gabaryt A",
            length_cm=64,
            width_cm=38,
            height_cm=8,
        )
    )
    session.add(
        OrderUiStatus(
            id=10,
            tenant_id=1,
            warehouse_id=1,
            name="Nowe",
            main_group="NEW",
            is_active=True,
        )
    )
    session.add(
        OrderUiStatus(
            id=20,
            tenant_id=1,
            warehouse_id=1,
            name="Smart Matching/3D",
            main_group="NEW",
            is_active=True,
        )
    )
    session.add(
        Order(
            id=50,
            tenant_id=1,
            warehouse_id=1,
            number="O-50",
            status="PICKING",
            picking_started_at=datetime.utcnow(),
        )
    )
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _pick_event(db, *, product_id: int, location_id: int, qty: float, operator_id: int = 7):
    o = db.query(Order).filter(Order.id == 50).first()
    p = type("P", (), {"quantity": qty, "order_item_id": None})()
    emit_wms_picked_item(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        pick=p,
        cart=None,
        product_sku=None,
        product_id=product_id,
        location_id=location_id,
        operator_user_id=operator_id,
    )


def test_picked_two_units_same_loc_one_activity_aggregate(db):
    _pick_event(db, product_id=101, location_id=11, qty=1)
    _pick_event(db, product_id=101, location_id=11, qty=1)
    db.flush()
    raw_n = (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.order_id == 50, WmsOrderEvent.event_type == EVT_PICKED_ITEM)
        .count()
    )
    assert raw_n == 2  # SSOT per-scan retained

    o = db.query(Order).filter(Order.id == 50).first()
    emit_wms_picking_finished(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        cart_id=None,
        operator_user_id=7,
        new_order_ui_status_id=None,
    )
    db.flush()
    items = list_activity_for_object(db, object_type="order", object_id=50)
    agg = [i for i in items if i["event_code"] == EVT_PICK_AGGREGATE]
    assert len(agg) == 1
    assert "Pobrano 2 × Sznurówadła CAT 100 cm z lokalizacji A1-A-1" in agg[0]["description"]
    assert (agg[0].get("actor_name") or "").find("Admin") >= 0 or agg[0].get("actor_user_id") == 7
    rows = build_order_inline_detail_rows(EVT_PICK_AGGREGATE, agg[0].get("metadata") or {})
    labels = {r["label"] for r in rows}
    assert "SKU" in labels and "EAN" in labels and "Lokalizacja" in labels


def test_two_locations_two_aggregates(db):
    _pick_event(db, product_id=101, location_id=11, qty=1)
    _pick_event(db, product_id=102, location_id=12, qty=1)
    o = db.query(Order).filter(Order.id == 50).first()
    emit_wms_picking_finished(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        cart_id=None,
        operator_user_id=7,
        new_order_ui_status_id=None,
    )
    db.flush()
    items = list_activity_for_object(db, object_type="order", object_id=50)
    agg = [i for i in items if i["event_code"] == EVT_PICK_AGGREGATE]
    assert len(agg) == 2
    fin = next(i for i in items if i["event_code"] == "PICKING_FINISHED")
    meta = fin.get("metadata") or {}
    assert int(meta.get("products_count") or 0) == 2
    assert int(meta.get("units_count") or 0) == 2
    assert int(meta.get("locations_count") or 0) == 2


def test_aggregate_idempotent_on_retry(db):
    _pick_event(db, product_id=101, location_id=11, qty=2)
    o = db.query(Order).filter(Order.id == 50).first()
    emit_wms_picking_finished(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        cart_id=None,
        operator_user_id=7,
        new_order_ui_status_id=None,
    )
    fin = (
        db.query(WmsOrderEvent)
        .filter(WmsOrderEvent.order_id == 50, WmsOrderEvent.event_type == "PICKING_FINISHED")
        .first()
    )
    emit_picking_pick_aggregates_to_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order=o,
        operator_user_id=7,
        picking_finished_event_id=int(fin.id),
    )
    items = list_activity_for_object(db, object_type="order", object_id=50)
    assert len([i for i in items if i["event_code"] == EVT_PICK_AGGREGATE]) == 1


def test_carton_selected_visible_with_dimensions(db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.wms_audit_service.carton_label_by_id",
        lambda db, *, tenant_id, warehouse_id, carton_id: (
            "64 × 38 × 8 cm",
            "Gabaryt A",
        ),
    )
    emit_wms_carton_selected_or_changed(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=50,
        operator_user_id=7,
        old_carton_id=None,
        new_carton_id="c-a",
    )
    db.flush()
    items = list_activity_for_object(db, object_type="order", object_id=50)
    row = next(i for i in items if i["event_code"] == "CARTON_SELECTED")
    msg = apply_wms_prefix("CARTON_SELECTED", row["description"], row.get("metadata"))
    assert "Gabaryt A" in msg
    assert "64" in msg and "38" in msg and "8" in msg


def test_no_carton_packing_finished(db):
    o = db.query(Order).filter(Order.id == 50).first()
    o.selected_carton_id = None
    o.packed_at = datetime.utcnow()
    db.add(o)
    db.flush()
    emit_wms_packing_finished(
        db, tenant_id=1, warehouse_id=1, order=o, operator_user_id=7
    )
    items = list_activity_for_object(db, object_type="order", object_id=50)
    row = next(i for i in items if i["event_code"] == "PACKING_FINISHED")
    assert "bez dodatkowego opakowania" in (row["description"] or "").lower()
    assert (row.get("metadata") or {}).get("no_carton") is True


def test_three_d_matching_source_visible(db):
    emit_wms_matching_outcome(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=50,
        source="THREE_D",
        matched=True,
        carton_id="c-a",
        carton_name="Gabaryt A",
        dimensions_label="64 × 38 × 8 cm",
        operator_user_id=7,
    )
    db.flush()
    items = list_activity_for_object(db, object_type="order", object_id=50)
    row = next(i for i in items if i["event_code"] == "THREE_D_MATCHING_MATCHED")
    assert "3D Matching dobrał" in (row["description"] or "")
    assert "Gabaryt A" in (row["description"] or "")
    assert (row.get("metadata") or {}).get("source") == "THREE_D"


def test_automation_blocked_shows_reason_conditions_effects(db):
    rule = AutomationRule(
        id=1,
        tenant_id=1,
        warehouse_id=1,
        name="Duża akcja",
        entity_type="ORDER",
        enabled=True,
        conditions_json="[]",
    )
    db.add(rule)
    db.flush()
    db.add(
        AutomationEffect(
            id=1,
            rule_id=1,
            position=0,
            effect_type="change_status",
            enabled=True,
            config_json='{"status_id": 20}',
        )
    )
    tev = StatusTransitionEvent(
        id="tev-1",
        tenant_id=1,
        warehouse_id=1,
        entity_type="ORDER",
        entity_id=50,
        old_status_key="10",
        new_status_key="20",
        occurred_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(tev)
    ex = AutomationExecution(
        id=9,
        rule_id=1,
        entity_type="ORDER",
        entity_id=50,
        status=EXEC_BLOCKED,
        error="unsupported_condition",
        trigger_event_id="tev-1",
        started_at=datetime.utcnow(),
        completed_at=datetime.utcnow(),
        conditions_evaluation_json=(
            '[{"fieldKey":"payment_status","operator":"eq","expected":"PAID",'
            '"actual":"UNPAID","matched":false}]'
        ),
        idempotency_key="k-9",
    )
    db.add(ex)
    db.flush()
    rule = db.query(AutomationRule).filter(AutomationRule.id == 1).first()
    presentation = build_automation_activity_presentation(
        db, tenant_id=1, rule=rule, execution=ex, trigger_event=tev
    )
    summary = format_automation_activity_summary(
        rule_name="Duża akcja", status="BLOCKED", presentation=presentation
    )
    assert "Duża akcja" in summary
    assert "zablokowana" in summary.lower()
    assert "nieobsługiwany" in summary.lower() or "Warunek" in str(presentation.get("conditions_lines"))
    assert presentation.get("blocked_reason")

    emit_automation_execution_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type="ORDER",
        entity_id=50,
        rule_id=1,
        rule_name="Duża akcja",
        execution_id=9,
        execution_status="BLOCKED",
        error="unsupported_condition",
        presentation=presentation,
    )
    # retry
    emit_automation_execution_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type="ORDER",
        entity_id=50,
        rule_id=1,
        rule_name="Duża akcja",
        execution_id=9,
        execution_status="BLOCKED",
        error="unsupported_condition",
        presentation=presentation,
    )
    items = list_activity_for_object(db, object_type="order", object_id=50)
    blocked = [i for i in items if i["event_code"] == AUTOMATION_BLOCKED]
    assert len(blocked) == 1
    meta = blocked[0].get("metadata") or {}
    assert meta.get("blocked_reason")
    rows = build_order_inline_detail_rows(AUTOMATION_BLOCKED, meta)
    assert any(r["label"] == "Powód" for r in rows)
    assert humanize_automation_blocked_reason("unsupported_condition")
