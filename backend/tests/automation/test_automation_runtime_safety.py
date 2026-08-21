"""Safety: unsupported conditions/effects block runtime — 0 side effects."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

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
from backend.services.automation.conditions import evaluate_conditions
from backend.services.automation.constants import (
    EFFECT_CHANGE_STATUS,
    EFFECT_SEND_SMS,
    ENTITY_ORDER,
    EXEC_BLOCKED,
    EXEC_SKIPPED,
    EXEC_SUCCEEDED,
    SOURCE_STATUS_ACTION,
)
from backend.services.automation.manual_run import import_legacy_fe_rules, run_rule_on_entity
from backend.services.automation.preflight import validate_automation_runtime
from backend.services.automation.store import create_rule, rule_to_dict


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, OrderUiStatus, Order, StatusTransitionEvent, AutomationRule):
        model.__table__.create(engine, checkfirst=True)
    AutomationEffect.__table__.create(engine, checkfirst=True)
    AutomationExecution.__table__.create(engine, checkfirst=True)
    AutomationEffectExecution.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    for sid, name in ((10, "A"), (20, "B"), (30, "C")):
        session.add(
            OrderUiStatus(id=sid, tenant_id=1, warehouse_id=1, name=name, main_group="NEW", is_active=True)
        )
    session.add(
        Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new", order_ui_status_id=10)
    )
    session.commit()
    yield session
    session.close()


def _change_to_20(**kw):
    return {
        "position": 0,
        "effect_type": EFFECT_CHANGE_STATUS,
        "config": {"status_id": 20},
        "enabled": True,
        **kw,
    }


def test_a_supported_condition_true_runs(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="ok",
        conditions=[{"fieldKey": "order_status", "operator": "eq", "value": ["10"]}],
        effects=[_change_to_20()],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    assert db.query(Order).get(100).order_ui_status_id == 20


def test_b_supported_condition_false_no_effect(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="no",
        conditions=[{"fieldKey": "order_status", "operator": "eq", "value": ["99"]}],
        effects=[_change_to_20()],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SKIPPED
    assert out.get("effects_executed", 0) == 0
    assert db.query(Order).get(100).order_ui_status_id == 10


def test_c_unsupported_condition_zero_effects(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="bad",
        conditions=[
            {"fieldKey": "order_status", "operator": "eq", "value": ["10"]},
            {"fieldKey": "allegro_account", "operator": "eq", "value": ["x"]},
        ],
        effects=[_change_to_20()],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_BLOCKED
    assert out["blocked_code"] == "unsupported_condition"
    assert out.get("effects_executed", 0) == 0
    assert db.query(Order).get(100).order_ui_status_id == 10


def test_d_invalid_condition_zero_effects(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="inv",
        conditions=[{"fieldKey": "order_status", "operator": "bogus", "value": ["10"]}],
        effects=[_change_to_20()],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    assert out["status"] == EXEC_BLOCKED
    assert out["blocked_code"] == "invalid_condition"
    assert db.query(Order).get(100).order_ui_status_id == 10


def test_e_f_legacy_import_preserves_unsupported_runtime_ready_false(db):
    payload = [
        {
            "id": "leg-1",
            "name": "Legacy",
            "group": "Ogólne",
            "enabled": True,
            "conditions": [
                {"fieldKey": "order_status", "operator": "in", "value": ["10"]},
                {"fieldKey": "order_source", "operator": "eq", "value": ["allegro"]},
            ],
            "effects": [{"kind": "change_status", "payload": {"order_ui_status_id": 20}}],
            "manualTrigger": {"enabled": True},
            "execution": {"automatic": True},
            "stats": {"lastRunAt": None, "runCount": 0},
        }
    ]
    r = import_legacy_fe_rules(db, tenant_id=1, warehouse_id=1, rules=payload)
    db.commit()
    assert r["created"] == 1
    rule = db.query(AutomationRule).get(r["rule_ids"][0])
    assert "order_source" in (rule.conditions_json or "")
    d = rule_to_dict(rule)
    assert d["runtime_ready"] is False
    assert any(i["code"] == "unsupported_condition" for i in d["validation_issues"])


def test_g_test_endpoint_blocked(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="t",
        conditions=[{"fieldKey": "integration_channel", "operator": "eq", "value": ["x"]}],
        effects=[_change_to_20()],
    )
    db.commit()
    out = run_rule_on_entity(
        db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, run_kind="TEST", dry_run=True
    )
    assert out["status"] == EXEC_BLOCKED
    assert out["dry_run"] is True
    assert out.get("effects_executed", 0) == 0


def test_h_status_enter_blocked(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="trig",
        trigger_config={"status_id": 20},
        conditions=[{"fieldKey": "allegro_account", "operator": "eq", "value": ["a"]}],
        effects=[_change_to_20()],
        metadata={"execution": {"automatic": True}},
    )
    db.commit()
    from backend.services.automation.runner import emit_entity_status_entered_and_run

    emit_entity_status_entered_and_run(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        previous_status_id=10,
        new_status_id=20,
        actor_user_id=None,
    )
    db.commit()
    assert db.query(Order).get(100).order_ui_status_id == 10  # no effect ran
    blocked = db.query(AutomationExecution).filter(AutomationExecution.status == EXEC_BLOCKED).all()
    assert len(blocked) >= 1


def test_i_j_unsupported_effect_preflight_zero_effects(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="fx",
        effects=[
            {"position": 0, "effect_type": EFFECT_SEND_SMS, "config": {}, "enabled": True},
            _change_to_20(position=1),
        ],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    assert out["status"] == EXEC_BLOCKED
    assert out["blocked_code"] == "unsupported_effect"
    assert db.query(Order).get(100).order_ui_status_id == 10

    rule2 = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="fx2",
        effects=[
            _change_to_20(position=0),
            {"position": 1, "effect_type": EFFECT_SEND_SMS, "config": {}, "enabled": True},
        ],
    )
    db.commit()
    out2 = run_rule_on_entity(db, rule=rule2, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    assert out2["status"] == EXEC_BLOCKED
    assert db.query(Order).get(100).order_ui_status_id == 10


def test_k_multiple_supported_effects_sequential(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="multi",
        effects=[
            {"position": 0, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 20}, "enabled": True},
            {"position": 1, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 30}, "enabled": True},
        ],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    assert db.query(Order).get(100).order_ui_status_id == 30


def test_l_status_action_regression(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="sa",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 20},
        effects=[_change_to_20()],
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.runtime_ready is True
    d = rule_to_dict(rule)
    assert d["runtime_ready"] is True


def test_evaluate_conditions_no_longer_skips(db):
    r = evaluate_conditions(
        db,
        conditions=[
            {"fieldKey": "order_status", "operator": "eq", "value": ["10"]},
            {"fieldKey": "allegro_account", "operator": "eq", "value": ["x"]},
        ],
        entity_type=ENTITY_ORDER,
        entity_id=100,
        tenant_id=1,
        ignore_unevaluable=True,
    )
    assert r.blocked is True
    assert r.matched is False
    assert "allegro_account" in r.unsupported_keys
