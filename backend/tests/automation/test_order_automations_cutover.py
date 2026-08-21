"""Order automations cutover — conditions, import, test/run, group/metadata."""

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
    ENTITY_ORDER,
    EXEC_SUCCEEDED,
    RUN_KIND_TEST,
    SOURCE_STATUS_ACTION,
)
from backend.services.automation.manual_run import import_legacy_fe_rules, run_rule_on_entity
from backend.services.automation.store import create_rule, duplicate_rule, find_rule_by_legacy_fe_id, list_rules


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
    AutomationEffect.__table__.create(engine, checkfirst=True)
    AutomationExecution.__table__.create(engine, checkfirst=True)
    AutomationEffectExecution.__table__.create(engine, checkfirst=True)

    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(Warehouse(id=2, tenant_id=1, name="WH2"))
    for sid, name in ((10, "A"), (20, "B"), (30, "C")):
        session.add(
            OrderUiStatus(
                id=sid, tenant_id=1, warehouse_id=1, name=name, main_group="NEW", is_active=True
            )
        )
    session.add(
        Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new", order_ui_status_id=10)
    )
    session.commit()
    yield session
    session.close()


def test_conditions_order_status_match(db):
    result = evaluate_conditions(
        db,
        conditions=[
            {"fieldKey": "order_status", "operator": "in", "value": ["10", "20"]},
        ],
        entity_type=ENTITY_ORDER,
        entity_id=100,
        tenant_id=1,
    )
    assert result.matched is True


def test_conditions_order_status_mismatch(db):
    result = evaluate_conditions(
        db,
        conditions=[{"fieldKey": "order_status", "operator": "eq", "value": ["99"]}],
        entity_type=ENTITY_ORDER,
        entity_id=100,
        tenant_id=1,
    )
    assert result.matched is False


def test_conditions_warehouse_isolation(db):
    result = evaluate_conditions(
        db,
        conditions=[{"fieldKey": "warehouse_id", "operator": "eq", "value": ["2"]}],
        entity_type=ENTITY_ORDER,
        entity_id=100,
        tenant_id=1,
    )
    assert result.matched is False


def test_unevaluable_ignored_by_default(db):
    result = evaluate_conditions(
        db,
        conditions=[
            {"fieldKey": "allegro_account", "operator": "eq", "value": ["x"]},
            {"fieldKey": "order_status", "operator": "eq", "value": ["10"]},
        ],
        entity_type=ENTITY_ORDER,
        entity_id=100,
        tenant_id=1,
        ignore_unevaluable=True,
    )
    assert result.matched is True
    assert "allegro_account" in result.skipped_unevaluable


def test_create_with_group_conditions_metadata(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="R1",
        group="Pakowanie",
        conditions=[{"fieldKey": "order_status", "operator": "eq", "value": ["10"]}],
        metadata={"manualTrigger": {"enabled": True}, "execution": {"automatic": True}},
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
        source="USER_AUTOMATION",
    )
    db.commit()
    assert rule.group == "Pakowanie"
    assert "order_status" in (rule.conditions_json or "")


def test_duplicate_rule(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="Src",
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    copy = duplicate_rule(db, rule)
    db.commit()
    assert copy.id != rule.id
    assert copy.enabled is False
    assert "(kopia)" in copy.name


def test_legacy_import_idempotent(db):
    payload = [
        {
            "id": "rule-fe-1",
            "name": "Legacy",
            "group": "Ogólne",
            "enabled": True,
            "conditions": [{"fieldKey": "order_status", "operator": "in", "value": ["10"]}],
            "effects": [{"kind": "change_status", "payload": {"order_ui_status_id": 20}}],
            "manualTrigger": {"enabled": True},
            "execution": {"automatic": True},
            "stats": {"lastRunAt": None, "runCount": 0},
        }
    ]
    r1 = import_legacy_fe_rules(db, tenant_id=1, warehouse_id=1, rules=payload)
    db.commit()
    r2 = import_legacy_fe_rules(db, tenant_id=1, warehouse_id=1, rules=payload)
    db.commit()
    assert r1["created"] == 1
    assert r2["created"] == 0
    assert r2["skipped"] == 1
    assert len(list_rules(db, tenant_id=1, warehouse_id=1)) == 1
    assert find_rule_by_legacy_fe_id(db, tenant_id=1, warehouse_id=1, legacy_fe_id="rule-fe-1")


def test_test_dry_run(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="T",
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    out = run_rule_on_entity(
        db,
        rule=rule,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        run_kind=RUN_KIND_TEST,
        dry_run=True,
        check_conditions=False,
    )
    assert out["dry_run"] is True
    assert out["status"] == "DRY_RUN"
    order = db.query(Order).get(100)
    assert order.order_ui_status_id == 10


def test_manual_run_change_status(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="M",
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    out = run_rule_on_entity(
        db,
        rule=rule,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        run_kind="MANUAL",
        dry_run=False,
        check_conditions=False,
    )
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    order = db.query(Order).get(100)
    assert order.order_ui_status_id == 20


def test_status_action_still_listable(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="SA",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 10},
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    rows = list_rules(db, tenant_id=1, warehouse_id=1)
    assert any(r.source == SOURCE_STATUS_ACTION for r in rows)
