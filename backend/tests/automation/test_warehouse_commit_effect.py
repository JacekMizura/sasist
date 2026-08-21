"""warehouse_commit automation effect — RETURN-only thin adapter."""

from __future__ import annotations

import uuid
from unittest.mock import MagicMock, patch

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
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.services.automation.constants import (
    EFFECT_WAREHOUSE_COMMIT,
    ENTITY_ORDER,
    ENTITY_RETURN,
    EXEC_BLOCKED,
    EXEC_SUCCEEDED,
    SOURCE_STATUS_ACTION,
)
from backend.services.automation.effects.warehouse_commit import execute_warehouse_commit
from backend.services.automation.manual_run import run_rule_on_entity
from backend.services.automation.preflight import validate_automation_runtime
from backend.services.automation.store import create_rule
from backend.services.returns.errors import RmzFinalizeError


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, Warehouse, WmsOrderReturn, StatusTransitionEvent, AutomationRule):
        model.__table__.create(engine, checkfirst=True)
    AutomationEffect.__table__.create(engine, checkfirst=True)
    AutomationExecution.__table__.create(engine, checkfirst=True)
    AutomationEffectExecution.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(
        WmsOrderReturn(
            id=50,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            rmz_number="RMZ-50",
            return_type="RMA",
            status_id=1,
            lines_json="[]",
        )
    )
    session.commit()
    yield session
    session.close()


def _event(*, entity_type=ENTITY_RETURN, entity_id=50):
    return StatusTransitionEvent(
        id=str(uuid.uuid4()),
        tenant_id=1,
        warehouse_id=1,
        entity_type=entity_type,
        entity_id=entity_id,
        old_status_key=None,
        new_status_key="1",
    )


def test_a_wrong_entity_order(db):
    ev = _event(entity_type=ENTITY_ORDER, entity_id=50)
    db.add(ev)
    db.flush()
    r = execute_warehouse_commit(db, config={}, event=ev, actor_user_id=1)
    assert r.ok is False
    assert r.data and r.data.get("error_code") == "entity_mismatch"


def test_b_return_not_found(db):
    ev = _event(entity_id=999)
    db.add(ev)
    db.flush()
    r = execute_warehouse_commit(db, config={}, event=ev, actor_user_id=1)
    assert r.ok is False
    assert r.data and r.data.get("error_code") == "return_not_found"


def test_c_success_calls_domain_service(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.warehouse_commit.warehouse_commit_rmz_existing_lines"
    ) as commit, patch(
        "backend.services.automation.effects.warehouse_commit.ensure_rmz_workflow_snapshot"
    ) as snap, patch(
        "backend.services.automation.effects.warehouse_commit.resolve_returns_settings"
    ) as settings:
        snap.return_value = MagicMock()
        settings.return_value = MagicMock()

        def _side(db, row, **kwargs):
            assert kwargs.get("process_refund") is False
            return row

        commit.side_effect = _side
        r = execute_warehouse_commit(db, config={}, event=ev, actor_user_id=9)
        assert r.ok is True
        assert r.data and r.data.get("return_id") == 50
        commit.assert_called_once()


def test_d_not_ready_fails(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.warehouse_commit.warehouse_commit_rmz_existing_lines",
        side_effect=RmzFinalizeError("Lines not ready for finalize"),
    ), patch(
        "backend.services.automation.effects.warehouse_commit.ensure_rmz_workflow_snapshot",
        return_value=MagicMock(),
    ), patch(
        "backend.services.automation.effects.warehouse_commit.resolve_returns_settings",
        return_value=MagicMock(),
    ):
        r = execute_warehouse_commit(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is False
        assert r.data and r.data.get("error_code") == "rmz_not_ready"


def test_e_already_committed_idempotent_success(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.warehouse_commit.warehouse_commit_rmz_existing_lines",
        side_effect=RmzFinalizeError("Warehouse commit already completed for this return"),
    ), patch(
        "backend.services.automation.effects.warehouse_commit.ensure_rmz_workflow_snapshot",
        return_value=MagicMock(),
    ), patch(
        "backend.services.automation.effects.warehouse_commit.resolve_returns_settings",
        return_value=MagicMock(),
    ):
        r = execute_warehouse_commit(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is True
        assert r.data and r.data.get("skipped") is True


def test_f_preflight_blocks_on_order_rule(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="bad",
        effects=[{"position": 0, "effect_type": EFFECT_WAREHOUSE_COMMIT, "config": {}, "enabled": True}],
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is False
    assert any(i.effect_type == EFFECT_WAREHOUSE_COMMIT for i in pf.issues)


def test_g_preflight_ok_on_return(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="ok",
        effects=[{"position": 0, "effect_type": EFFECT_WAREHOUSE_COMMIT, "config": {}, "enabled": True}],
        source=SOURCE_STATUS_ACTION,
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is True


def test_h_rule_run_with_mock(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="wh",
        effects=[{"position": 0, "effect_type": EFFECT_WAREHOUSE_COMMIT, "config": {}, "enabled": True}],
    )
    db.commit()
    with patch(
        "backend.services.automation.effects.warehouse_commit.warehouse_commit_rmz_existing_lines"
    ) as commit, patch(
        "backend.services.automation.effects.warehouse_commit.ensure_rmz_workflow_snapshot",
        return_value=MagicMock(),
    ), patch(
        "backend.services.automation.effects.warehouse_commit.resolve_returns_settings",
        return_value=MagicMock(),
    ):
        commit.side_effect = lambda db, row, **kw: row
        out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_RETURN, entity_id=50, dry_run=False)
        db.commit()
        assert out["status"] == EXEC_SUCCEEDED
        commit.assert_called_once()


def test_i_wrong_entity_rule_blocked(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="bad2",
        effects=[{"position": 0, "effect_type": EFFECT_WAREHOUSE_COMMIT, "config": {}, "enabled": True}],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=50, dry_run=False)
    assert out["status"] == EXEC_BLOCKED
