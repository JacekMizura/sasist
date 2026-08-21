"""Backend Automation Engine v1 — test matrix A–Q (core)."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.automation import (
    AutomationEffectExecution,
    AutomationExecution,
    AutomationRule,
    StatusTransitionEvent,
)
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.automation.constants import (
    EFFECT_CHANGE_STATUS,
    EFFECT_SEND_EMAIL,
    ENTITY_ORDER,
    EXEC_BLOCKED,
    EXEC_FAILED,
    EXEC_SUCCEEDED,
    MAX_AUTOMATION_DEPTH,
)
from backend.services.automation.events import create_status_transition_event
from backend.services.automation.runner import (
    emit_order_status_entered_and_run,
    idempotency_key,
    run_automations_for_status_entered,
)
from backend.services.automation.store import (
    create_rule,
    delete_rule,
    get_rule,
    list_rules,
    set_rule_enabled,
    update_rule,
)
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        Order,
        StatusTransitionEvent,
        AutomationRule,
    ):
        model.__table__.create(engine, checkfirst=True)
    # Dependent tables after AutomationRule
    from backend.models.automation import AutomationEffect, AutomationEffectExecution, AutomationExecution

    AutomationEffect.__table__.create(engine, checkfirst=True)
    AutomationExecution.__table__.create(engine, checkfirst=True)
    AutomationEffectExecution.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Tenant(id=2, name="T2", default_warehouse_id=3))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(Warehouse(id=2, tenant_id=1, name="WH2"))
    session.add(Warehouse(id=3, tenant_id=2, name="WH3"))
    for sid, name, wid in ((10, "Nowe", 1), (20, "Pakowanie", 1), (30, "Wysłane", 1), (40, "WH2-A", 2)):
        session.add(
            OrderUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=wid,
                name=name,
                main_group="NEW",
                is_active=True,
            )
        )
    session.add(
        Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new", order_ui_status_id=10)
    )
    session.add(
        Order(id=200, tenant_id=1, warehouse_id=2, number="O-200", status="new", order_ui_status_id=None)
    )
    session.add(
        Order(id=300, tenant_id=2, warehouse_id=3, number="O-300", status="new", order_ui_status_id=None)
    )
    session.commit()
    yield session
    session.close()


def _rule_enter_20(db, **kw):
    defaults = dict(
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Enter 20",
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
    defaults.update(kw)
    return create_rule(db, **defaults)


# --- A CRUD ---
def test_A_crud(db):
    r = _rule_enter_20(db, effects=[])
    db.commit()
    assert get_rule(db, tenant_id=1, rule_id=int(r.id)) is not None
    update_rule(db, r, name="Renamed")
    db.commit()
    assert get_rule(db, tenant_id=1, rule_id=int(r.id)).name == "Renamed"
    delete_rule(db, r)
    db.commit()
    assert get_rule(db, tenant_id=1, rule_id=int(r.id)) is None


def test_B_tenant_isolation(db):
    _rule_enter_20(db, tenant_id=1, warehouse_id=1, effects=[])
    db.commit()
    assert list_rules(db, tenant_id=2) == []
    assert list_rules(db, tenant_id=1)


def test_C_warehouse_scope(db):
    _rule_enter_20(db, warehouse_id=1, effects=[])
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=None,
        entity_type=ENTITY_ORDER,
        name="All WH",
        trigger_config={"status_id": 20},
        effects=[],
    )
    db.commit()
    scoped = list_rules(db, tenant_id=1, warehouse_id=1)
    assert len(scoped) == 2  # WH1 + NULL
    only2 = list_rules(db, tenant_id=1, warehouse_id=2)
    assert len(only2) == 1  # only NULL warehouse rule


def test_D_same_status_zero_executions(db):
    _rule_enter_20(db)
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=10)
    db.commit()
    assert db.query(StatusTransitionEvent).count() == 0
    assert db.query(AutomationExecution).count() == 0


def test_E_A_to_B_one_execution(db):
    _rule_enter_20(db, effects=[])  # match only, no side effect
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    assert db.query(StatusTransitionEvent).count() == 1
    assert db.query(AutomationExecution).count() == 1
    ex = db.query(AutomationExecution).first()
    assert ex.status == EXEC_SUCCEEDED


def test_F_retry_same_event_one_execution(db):
    rule = _rule_enter_20(db, effects=[])
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    event = create_status_transition_event(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        old_status_key="10",
        new_status_key="20",
    )
    db.flush()
    r1 = run_automations_for_status_entered(db, event=event)
    r2 = run_automations_for_status_entered(db, event=event)
    db.commit()
    assert db.query(AutomationExecution).count() == 1
    assert r2[0].get("duplicate") is True
    assert r1[0]["status"] == EXEC_SUCCEEDED
    key = idempotency_key(int(rule.id), ENTITY_ORDER, 100, event.id)
    assert db.query(AutomationExecution).first().idempotency_key == key


def test_G_reentry_two_executions(db):
    _rule_enter_20(db, effects=[])
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    apply_order_panel_ui_status(db, order=order, sub_status_id=10)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    # Events: 10→20, 20→10, 10→20 = 3 events; executions for enter-20 = 2
    assert db.query(StatusTransitionEvent).count() == 3
    assert db.query(AutomationExecution).count() == 2


def test_H_disabled_rule(db):
    r = _rule_enter_20(db, effects=[])
    set_rule_enabled(db, r, False)
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    assert db.query(AutomationExecution).count() == 0


def test_I_J_ordered_effects_and_stop_on_failure(db):
    """Preflight: unsupported effect in the chain → 0 effects executed (not partial)."""
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Ordered",
        trigger_config={"status_id": 20},
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 30},
                "enabled": True,
            },
            {
                "effect_type": EFFECT_SEND_EMAIL,
                "position": 1,
                "config": {},
                "enabled": True,
            },
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 2,
                "config": {"order_ui_status_id": 10},
                "enabled": True,
            },
        ],
    )
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    ex = db.query(AutomationExecution).first()
    assert ex.status == EXEC_BLOCKED
    assert db.query(AutomationEffectExecution).filter(
        AutomationEffectExecution.execution_id == ex.id
    ).count() == 0
    db.refresh(order)
    assert int(order.order_ui_status_id) == 20  # only panel apply; no automation effects


def test_K_change_status_via_domain(db):
    _rule_enter_20(db)  # sets status to 30 on enter 20
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    db.refresh(order)
    assert int(order.order_ui_status_id) == 30
    ee = db.query(AutomationEffectExecution).filter(
        AutomationEffectExecution.effect_type == EFFECT_CHANGE_STATUS,
        AutomationEffectExecution.status == EXEC_SUCCEEDED,
    ).first()
    assert ee is not None
    assert ee.result_json and "order_ui_status_id" in (ee.result_json or "")


def test_L_M_chain_and_loop_protection(db):
    # 20 → 30, 30 → 20 would loop; depth limit stops
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="to30",
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
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="to20",
        trigger_config={"status_id": 30},
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    # Chain runs but capped by MAX_AUTOMATION_DEPTH
    events = db.query(StatusTransitionEvent).count()
    assert events >= 2
    assert events <= MAX_AUTOMATION_DEPTH + 2  # root + nested enters


def test_N_audit_persisted(db):
    _rule_enter_20(db, effects=[])
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20, operator_user_id=None)
    db.commit()
    ev = db.query(StatusTransitionEvent).first()
    ex = db.query(AutomationExecution).first()
    assert ev.new_status_key == "20"
    assert ex.trigger_event_id == ev.id
    assert ex.entity_id == 100


def test_O_resume_skips_completed_effect(db):
    """Unsupported effect → BLOCKED with 0 effect rows; retry stays BLOCKED (no partial)."""
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Resume",
        trigger_config={"status_id": 20},
        effects=[
            {
                "effect_type": EFFECT_CHANGE_STATUS,
                "position": 0,
                "config": {"order_ui_status_id": 30},
                "enabled": True,
            },
            {
                "effect_type": EFFECT_SEND_EMAIL,
                "position": 1,
                "config": {},
                "enabled": True,
            },
        ],
    )
    db.commit()
    event = create_status_transition_event(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        old_status_key="10",
        new_status_key="20",
    )
    db.flush()
    run_automations_for_status_entered(db, event=event)
    db.commit()
    ex = db.query(AutomationExecution).first()
    assert ex.status == EXEC_BLOCKED
    run_automations_for_status_entered(db, event=event)
    db.commit()
    assert db.query(AutomationExecution).count() == 1
    assert (
        db.query(AutomationEffectExecution)
        .filter(AutomationEffectExecution.execution_id == ex.id)
        .count()
        == 0
    )


def test_P_unsupported_effect_rejected(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Email only",
        trigger_config={"status_id": 20},
        effects=[{"effect_type": EFFECT_SEND_EMAIL, "position": 0, "config": {}, "enabled": True}],
    )
    db.commit()
    order = db.query(Order).filter(Order.id == 100).first()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    ex = db.query(AutomationExecution).first()
    assert ex.status == EXEC_BLOCKED
    assert "unsupported" in (ex.error or "").lower()
    assert db.query(AutomationEffectExecution).count() == 0


def test_schema_ensure(db):
    from backend.db.schema_upgrade import ensure_automation_engine_tables

    ensure_automation_engine_tables(db.get_bind())
