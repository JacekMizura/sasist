"""STATUS_ACTION one-rule upsert — managed merge + advanced effect preservation."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.automation import AutomationEffect, AutomationRule, StatusTransitionEvent
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.automation.constants import SOURCE_STATUS_ACTION
from backend.services.automation.effects import parse_config
from backend.services.automation.status_actions import (
    list_status_action_rules,
    logical_status_action_key,
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


def _effect_types(rule: AutomationRule) -> list[tuple[str, bool]]:
    out = []
    for e in sorted(rule.effects or [], key=lambda x: (int(x.position), int(x.id or 0))):
        cfg = parse_config(e.config_json)
        key = logical_status_action_key(str(e.effect_type), cfg)
        out.append((key, bool(e.enabled)))
    return out


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


def test_d_return_warehouse_commit_without_target_status(db):
    r = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=7,
        warehouse_id=1,
        status_name="Magazyn",
        effects=[{"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True}],
    )
    db.commit()
    assert r.enabled is True
    keys = _effect_types(r)
    assert ("warehouse_commit", True) in keys
    assert not any(k == "change_status" for k, _ in keys)


def test_g_all_managed_off_disables_rule(db):
    upsert_status_action_bundle(
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
    r = upsert_status_action_bundle(
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
                "enabled": False,
            },
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL", "template_id": 2, "user_id": 1},
                "enabled": False,
            },
        ],
    )
    db.commit()
    assert r.enabled is False


def test_h_preserve_change_status_when_panel_saves_managed_off(db):
    """H: existing change_status ON + email OFF → panel save must keep change_status + rule enabled."""
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type="ORDER",
        name="legacy sa",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 10},
        enabled=True,
        effects=[
            {
                "position": 0,
                "effect_type": "change_status",
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    r = upsert_status_action_bundle(
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
                "enabled": False,
            },
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL", "template_id": 2, "user_id": 1},
                "enabled": False,
            },
        ],
    )
    db.commit()
    assert r.enabled is True
    keys = dict(_effect_types(r))
    assert keys.get("change_status") is True
    assert keys.get("send_email_customer") is False


def test_i_toggle_email_preserves_change_status(db):
    """I: change_status ON + email ON → disable email keeps change_status."""
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type="RETURN",
        name="sa",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 5},
        enabled=True,
        effects=[
            {
                "position": 0,
                "effect_type": "change_status",
                "config": {"status_id": 9},
                "enabled": True,
            },
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": True,
            },
        ],
    )
    db.commit()
    r = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=5,
        warehouse_id=1,
        status_name="Magazyn",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": False,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL", "template_id": 2, "user_id": 1},
                "enabled": False,
            },
        ],
    )
    db.commit()
    assert r.enabled is True
    keys = dict(_effect_types(r))
    assert keys.get("change_status") is True
    assert keys.get("send_email_customer") is False


def test_payload_change_status_ignored_does_not_wipe_preserved(db):
    """Panel must not seed/replace change_status via payload; existing preserved."""
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type="ORDER",
        name="sa",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 10},
        effects=[
            {
                "position": 0,
                "effect_type": "change_status",
                "config": {"status_id": 20},
                "enabled": True,
            }
        ],
    )
    db.commit()
    r = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="ORDER",
        status_id=10,
        warehouse_id=1,
        status_name="Nowy",
        effects=[
            {
                "position": 0,
                "effect_type": "change_status",
                "config": {"status_id": 99},
                "enabled": False,
            },
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": True,
            },
        ],
    )
    db.commit()
    cs = [e for e in r.effects if str(e.effect_type) == "change_status"]
    assert len(cs) == 1
    assert bool(cs[0].enabled) is True
    assert parse_config(cs[0].config_json).get("status_id") == 20


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
    # Primary keeps its managed warehouse_commit; change_status from primary (if any) preserved —
    # duplicate rule's change_status is on the disabled extra, not merged into primary.
    assert primary.enabled is True


def test_k_tenant_isolation_list(db):
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="ORDER",
        status_id=10,
        warehouse_id=1,
        status_name="A",
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
    other = list_status_action_rules(db, tenant_id=2, entity_type="ORDER", status_id=10, warehouse_id=1)
    assert other == []


def test_overview_batch_projection(db):
    from backend.services.automation.status_actions import status_actions_overview

    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=7,
        warehouse_id=1,
        status_name="Magazyn",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": True,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL", "template_id": 2, "user_id": 1},
                "enabled": False,
            },
        ],
    )
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=8,
        warehouse_id=1,
        status_name="Nowy",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
        ],
    )
    db.commit()
    overview = status_actions_overview(db, tenant_id=1, entity_type="RETURN", warehouse_id=1)
    assert "7" in overview
    assert overview["7"]["warehouse_commit"]["enabled"] is True
    assert overview["7"]["send_email_customer"]["enabled"] is True
    assert overview["7"]["send_email_customer"]["template_id"] == 1
    assert overview["7"]["send_email_internal"]["enabled"] is False
    assert overview["7"]["send_email_internal"].get("template_id") == 2
    # Status 8: rule disabled — still present with enabled=false for matrix OFF state
    assert overview["8"]["warehouse_commit"]["enabled"] is False
    assert status_actions_overview(db, tenant_id=2, entity_type="RETURN", warehouse_id=1) == {}


def test_list_modal_warehouse_commit_roundtrip_survives_reload(db):
    """
    Regression: Magazyn OFF → ON → overview ON → modal ON → OFF → overview OFF.
    Covers the list↔modal sync contract (same STATUS_ACTION SSOT).
    """
    from backend.services.automation.status_actions import status_actions_overview

    sid = 42
    # Start OFF
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=sid,
        warehouse_id=1,
        status_name="Sklep",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER"},
                "enabled": False,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL"},
                "enabled": False,
            },
        ],
    )
    db.commit()
    ov = status_actions_overview(db, tenant_id=1, entity_type="RETURN", warehouse_id=1)
    assert ov[str(sid)]["warehouse_commit"]["enabled"] is False

    # Inline ON (matrix PUT)
    rule = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=sid,
        warehouse_id=1,
        status_name="Sklep",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER"},
                "enabled": False,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL"},
                "enabled": False,
            },
        ],
    )
    db.commit()
    assert rule.enabled is True
    ov2 = status_actions_overview(db, tenant_id=1, entity_type="RETURN", warehouse_id=1)
    assert ov2[str(sid)]["warehouse_commit"]["enabled"] is True

    # Modal projection (same primary rule)
    rows = list_status_action_rules(db, tenant_id=1, entity_type="RETURN", status_id=sid, warehouse_id=1)
    assert len(rows) >= 1
    modal_keys = _effect_types(rows[0])
    assert ("warehouse_commit", True) in modal_keys

    # Modal OFF → save
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=sid,
        warehouse_id=1,
        status_name="Sklep",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER"},
                "enabled": False,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL"},
                "enabled": False,
            },
        ],
    )
    db.commit()
    ov3 = status_actions_overview(db, tenant_id=1, entity_type="RETURN", warehouse_id=1)
    assert ov3[str(sid)]["warehouse_commit"]["enabled"] is False


def test_email_toggle_preserves_template_and_rejects_invalid_enable(db):
    """Email OFF keeps template_id; enabling without template stays disabled in overview."""
    from backend.services.automation.status_actions import status_actions_overview

    sid = 99
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=sid,
        warehouse_id=1,
        status_name="Mail",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 55},
                "enabled": True,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL"},
                "enabled": False,
            },
        ],
    )
    db.commit()

    # OFF — preserve template in config
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=sid,
        warehouse_id=1,
        status_name="Mail",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 55},
                "enabled": False,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL"},
                "enabled": False,
            },
        ],
    )
    db.commit()
    ov = status_actions_overview(db, tenant_id=1, entity_type="RETURN", warehouse_id=1)
    assert ov[str(sid)]["send_email_customer"]["enabled"] is False
    assert ov[str(sid)]["send_email_customer"]["template_id"] == 55

    # ON again — template preserved
    upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type="RETURN",
        status_id=sid,
        warehouse_id=1,
        status_name="Mail",
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": False},
            {
                "position": 1,
                "effect_type": "send_email",
                "config": {"recipient_type": "CUSTOMER", "template_id": 55},
                "enabled": True,
            },
            {
                "position": 2,
                "effect_type": "send_email",
                "config": {"recipient_type": "INTERNAL"},
                "enabled": False,
            },
        ],
    )
    db.commit()
    ov2 = status_actions_overview(db, tenant_id=1, entity_type="RETURN", warehouse_id=1)
    assert ov2[str(sid)]["send_email_customer"]["enabled"] is True
    assert ov2[str(sid)]["send_email_customer"]["template_id"] == 55
