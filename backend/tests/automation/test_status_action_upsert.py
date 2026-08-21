"""STATUS_ACTION one-rule upsert — no duplicates on toggle cycles."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.automation import AutomationEffect, AutomationRule, StatusTransitionEvent
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.automation.constants import SOURCE_STATUS_ACTION
from backend.services.automation.status_actions import (
    list_status_action_rules,
    upsert_status_action_bundle,
)
from backend.services.automation.store import create_rule


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, StatusTransitionEvent, AutomationRule):
        model.__table__.create(engine, checkfirst=True)
    AutomationEffect.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.commit()
    yield session
    session.close()


def test_upsert_creates_one_rule(db):
    r1 = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="ORDER",
        status_id=10,
        warehouse_id=1,
        status_name="Nowy",
        effects=[
            {
                "position": 0,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": True,
            }
        ],
    )
    db.commit()
    assert r1.id
    assert r1.source == SOURCE_STATUS_ACTION
    assert "Po wejściu w status: Nowy" in r1.name
    rows = list_status_action_rules(db, tenant_id=1, entity_type="ORDER", status_id=10, warehouse_id=1)
    assert len(rows) == 1


def test_upsert_toggle_cycle_no_duplicates(db):
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=5,
        warehouse_id=1,
        status_name="Przyjęty",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 2},
                "enabled": True,
            },
        ],
    )
    db.commit()
    # OFF all
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=5,
        warehouse_id=1,
        status_name="Przyjęty",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 2},
                "enabled": False,
            },
        ],
    )
    db.commit()
    # ON again
    r = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=5,
        warehouse_id=1,
        status_name="Przyjęty",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True},
        ],
    )
    db.commit()
    rows = list_status_action_rules(db, tenant_id=1, entity_type="RETURN", status_id=5, warehouse_id=1)
    enabled_rules = [x for x in rows if x.enabled]
    assert len(enabled_rules) == 1
    assert enabled_rules[0].id == r.id
    # Extra legacy rules get disabled
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type="RETURN",
        name="legacy dup",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 5},
        effects=[{"position": 0, "effect_type": "change_status", "config": {"status_id": 9}, "enabled": True}],
    )
    db.commit()
    primary = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=5,
        warehouse_id=1,
        status_name="Przyjęty",
        effects=[{"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True}],
    )
    db.commit()
    rows = list_status_action_rules(db, tenant_id=1, entity_type="RETURN", status_id=5, warehouse_id=1)
    assert sum(1 for x in rows if x.enabled) == 1
    assert primary.id == min(x.id for x in rows)
