"""Order › Logi Phase 1 — status / automation / document activity writers."""

from __future__ import annotations

import json

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
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.activity_log.order_event_codes import (
    AUTOMATION_SUCCEEDED,
    ORDER_STATUS_CHANGED,
)
from backend.services.activity_log.service import list_activity_for_object
from backend.services.automation.constants import (
    EFFECT_CHANGE_STATUS,
    ENTITY_ORDER,
    EXEC_SKIPPED,
    EXEC_SUCCEEDED,
)
from backend.services.automation.runner import emit_order_status_entered_and_run
from backend.services.automation.store import create_rule
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status


@pytest.fixture
def db():
    from backend.services.automation.events import automation_depth_var, automation_root_event_var

    automation_depth_var.set(0)
    automation_root_event_var.set(None)

    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        AppUser,
        OrderUiStatus,
        Order,
        StatusTransitionEvent,
        AutomationRule,
        AutomationEffect,
        AutomationExecution,
        AutomationEffectExecution,
        ActivityEvent,
        ActivityEventLink,
    ):
        model.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(
        AppUser(
            id=7,
            login="jacek",
            email="jacek@example.com",
            password_hash="x",
            first_name="Jacek",
            last_name="Mizura",
            is_active=True,
        )
    )
    for sid, name in ((10, "Nowe"), (20, "Smart Matching/3D"), (30, "Zbieranie")):
        session.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=1,
                name=name,
                main_group="NEW",
                is_active=True,
            )
        )
    session.add(
        Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new", order_ui_status_id=10)
    )
    session.commit()
    yield session
    session.close()


def _activity_codes(db, order_id: int = 100) -> list[str]:
    items = list_activity_for_object(db, object_type="order", object_id=order_id)
    return [str(i["event_code"]) for i in items]


def test_A_B_C_manual_status_change_one_activity(db):
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(
        db,
        order=order,
        sub_status_id=20,
        operator_user_id=7,
    )
    db.commit()

    items = list_activity_for_object(db, object_type="order", object_id=100)
    status_rows = [i for i in items if i["event_code"] == ORDER_STATUS_CHANGED]
    assert len(status_rows) == 1
    row = status_rows[0]
    assert "Nowe" in row["description"] and "Smart Matching/3D" in row["description"]
    assert row["metadata"].get("old_status_key") == "10"
    assert row["metadata"].get("new_status_key") == "20"
    assert row["metadata"].get("actor_kind") == "USER"
    assert row["operator_display"] == "Jacek Mizura"


def test_E_duplicate_status_transition_idempotent(db):
    order = db.query(Order).get(100)
    ev = emit_order_status_entered_and_run(
        db,
        order=order,
        previous_status_id=10,
        new_status_id=20,
        actor_user_id=7,
    )
    assert ev is not None
    # Same transition identity cannot be recreated; re-emit activity via same correlation
    from backend.services.activity_log.order_activity import emit_order_status_changed_activity

    emit_order_status_changed_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        old_status_key="10",
        new_status_key="20",
        status_transition_event_id=str(ev.id),
        actor_user_id=7,
    )
    db.commit()
    status_rows = [
        i for i in list_activity_for_object(db, object_type="order", object_id=100) if i["event_code"] == ORDER_STATUS_CHANGED
    ]
    assert len(status_rows) == 1


def test_F_J_K_L_N_automation_success_snapshot_expand_idempotent(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Nowe → Smart Matching/3D",
        enabled=True,
        trigger_config={"status_id": 20},
        conditions=[{"fieldKey": "order_status", "operator": "in", "value": ["20"]}],
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 30},
                "enabled": True,
            }
        ],
    )
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20, operator_user_id=7)
    db.commit()

    auto_rows = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == AUTOMATION_SUCCEEDED
    ]
    assert len(auto_rows) == 1
    assert "Nowe → Smart Matching/3D" in auto_rows[0]["description"]
    assert auto_rows[0]["metadata"].get("actor_kind") == "AUTOMATION"
    assert auto_rows[0]["operator_display"] == "Automatyzacja"
    exec_id = int(auto_rows[0]["metadata"]["automation_execution_id"])

    ex = db.query(AutomationExecution).get(exec_id)
    assert ex is not None
    assert ex.status == EXEC_SUCCEEDED
    assert ex.conditions_evaluation_json
    snap = json.loads(ex.conditions_evaluation_json)
    assert isinstance(snap, list) and snap
    assert snap[0].get("condition_type") == "order_status"
    assert snap[0].get("matched") is True

    from backend.services.automation.execution_detail import build_execution_expand_detail

    detail = build_execution_expand_detail(db, execution=ex, tenant_id=1)
    assert detail["rule"]["name"] == "Nowe → Smart Matching/3D"
    assert detail["conditions"]
    assert detail["effects"]
    assert detail["effects"][0]["status"] == EXEC_SUCCEEDED

    # Idempotent retry of successful execution must not duplicate Activity
    from backend.services.automation.runner import run_automations_for_status_entered

    tev = db.query(StatusTransitionEvent).filter(StatusTransitionEvent.entity_id == 100).order_by(StatusTransitionEvent.created_at.asc()).first()
    run_automations_for_status_entered(db, event=tev)
    db.commit()
    auto_rows2 = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == AUTOMATION_SUCCEEDED
    ]
    assert len(auto_rows2) == 1


def test_H_not_matched_rule_no_activity(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Only when status 99",
        enabled=True,
        trigger_config={"status_id": 20},
        conditions=[{"fieldKey": "order_status", "operator": "in", "value": ["99"]}],
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 30},
                "enabled": True,
            }
        ],
    )
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20, operator_user_id=7)
    db.commit()

    assert AUTOMATION_SUCCEEDED not in _activity_codes(db)
    ex = db.query(AutomationExecution).filter(AutomationExecution.entity_id == 100).first()
    assert ex is not None
    assert ex.status == EXEC_SKIPPED


def test_O_chain_user_then_automation_status(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Auto to Zbieranie",
        enabled=True,
        trigger_config={"status_id": 20},
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 30},
                "enabled": True,
            }
        ],
    )
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20, operator_user_id=7)
    db.commit()

    items = list_activity_for_object(db, object_type="order", object_id=100)
    # Newest first
    kinds = [(i["event_code"], i["metadata"].get("actor_kind"), i["operator_display"]) for i in items]
    status_kinds = [k for k in kinds if k[0] == ORDER_STATUS_CHANGED]
    # Expect user 10→20 and automation-driven 20→30
    assert len(status_kinds) >= 2
    assert any(k[1] == "USER" for k in status_kinds)
    assert any(k[1] == "AUTOMATION" for k in status_kinds)
    assert any(i["event_code"] == AUTOMATION_SUCCEEDED for i in items)


def test_M_expand_tenant_isolation(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Rule",
        enabled=True,
        trigger_config={"status_id": 20},
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 30},
                "enabled": True,
            }
        ],
    )
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20, operator_user_id=7)
    db.commit()
    ex = db.query(AutomationExecution).filter(AutomationExecution.entity_id == 100).first()
    assert ex is not None

    from backend.services.automation.execution_detail import get_execution_for_tenant

    assert get_execution_for_tenant(db, execution_id=int(ex.id), tenant_id=1) is not None
    assert get_execution_for_tenant(db, execution_id=int(ex.id), tenant_id=999) is None


def test_P_sale_document_activity_idempotent(db):
    from backend.services.activity_log.order_activity import emit_sale_document_created_activity

    emit_sale_document_created_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        sale_document_id="doc-1",
        document_number="FV/1/08/2026",
        panel_document_type="INVOICE",
        document_kind="PRIMARY",
    )
    emit_sale_document_created_activity(
        db,
        tenant_id=1,
        warehouse_id=1,
        order_id=100,
        sale_document_id="doc-1",
        document_number="FV/1/08/2026",
        panel_document_type="INVOICE",
        document_kind="PRIMARY",
    )
    db.commit()
    docs = [
        i
        for i in list_activity_for_object(db, object_type="order", object_id=100)
        if i["event_code"] == "SALE_DOCUMENT_CREATED"
    ]
    assert len(docs) == 1
    assert "FV/1/08/2026" in docs[0]["description"]
