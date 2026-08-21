"""generate_sale_correction automation effect — RETURN-only thin adapter."""

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
    EFFECT_GENERATE_SALE_CORRECTION,
    EFFECT_SEND_EMAIL,
    EFFECT_WAREHOUSE_COMMIT,
    ENTITY_COMPLAINT,
    ENTITY_ORDER,
    ENTITY_RETURN,
    EXEC_BLOCKED,
    EXEC_FAILED,
    EXEC_SUCCEEDED,
    SOURCE_STATUS_ACTION,
)
from backend.services.automation.effects.generate_sale_correction import execute_generate_sale_correction
from backend.services.automation.manual_run import run_rule_on_entity
from backend.services.automation.preflight import validate_automation_runtime
from backend.services.automation.status_actions import upsert_status_action_bundle
from backend.services.automation.store import create_rule
from backend.services.sale_documents.errors import SaleCorrectionError


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
    session.add(Warehouse(id=2, tenant_id=1, name="WH2"))
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
            warehouse_document_id=900,
        )
    )
    session.add(
        WmsOrderReturn(
            id=51,
            tenant_id=1,
            warehouse_id=1,
            order_id=101,
            rmz_number="RMZ-51",
            return_type="RMA",
            status_id=1,
            lines_json="[]",
            warehouse_document_id=None,
        )
    )
    session.commit()
    yield session
    session.close()


def _event(*, entity_type=ENTITY_RETURN, entity_id=50, tenant_id=1, warehouse_id=1):
    return StatusTransitionEvent(
        id=str(uuid.uuid4()),
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        entity_type=entity_type,
        entity_id=entity_id,
        old_status_key=None,
        new_status_key="1",
    )


def _fake_doc(*, reused=False):
    doc = MagicMock()
    doc.id = "corr-1"
    doc.document_number = "KOR/1/2026"
    doc.source_sale_document_id = "src-1"
    doc.source_document = MagicMock(document_number="FV/1/2026")
    return doc, reused


def test_a_preflight_ready_return(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="ok",
        effects=[{"position": 0, "effect_type": EFFECT_GENERATE_SALE_CORRECTION, "config": {}, "enabled": True}],
        source=SOURCE_STATUS_ACTION,
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is True
    assert pf.runtime_ready is True


def test_b_order_blocked(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="bad-order",
        effects=[{"position": 0, "effect_type": EFFECT_GENERATE_SALE_CORRECTION, "config": {}, "enabled": True}],
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is False
    assert pf.blocked_code == "unsupported_entity_for_effect"


def test_c_complaint_blocked(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_COMPLAINT,
        name="bad-complaint",
        effects=[{"position": 0, "effect_type": EFFECT_GENERATE_SALE_CORRECTION, "config": {}, "enabled": True}],
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is False
    assert any(i.code == "unsupported_entity_for_effect" for i in pf.issues)


def test_d_e_f_g_success_result_shape(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        return_value=_fake_doc(reused=False),
    ) as issue:
        r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is True
        assert r.data["correction_document_id"] == "corr-1"
        assert r.data["correction_number"] == "KOR/1/2026"
        assert r.data["source_document_id"] == "src-1"
        assert r.data["source_document_number"] == "FV/1/2026"
        assert r.data["reused_existing"] is False
        issue.assert_called_once()
        kwargs = issue.call_args.kwargs
        assert kwargs["return_id"] == 50
        assert kwargs["tenant_id"] == 1


def test_h_j_retry_reuses_existing(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        return_value=_fake_doc(reused=True),
    ):
        r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is True
        assert r.data["reused_existing"] is True
        assert r.data["correction_document_id"] == "corr-1"


def test_k_return_not_ready(db):
    ev = _event(entity_id=51)
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        side_effect=SaleCorrectionError(
            "RETURN_NOT_READY",
            "Korekta wymaga zakończonego przyjęcia magazynowego",
        ),
    ):
        r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is False
        assert r.data["error_code"] == "return_not_ready_for_correction"


def test_l_receipt_source(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        side_effect=SaleCorrectionError(
            "CORRECTION_NOT_SUPPORTED_FOR_DOCUMENT_TYPE",
            "V1 obsługuje wyłącznie korektę faktury",
        ),
    ):
        r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is False
        assert r.data["error_code"] == "correction_not_supported_for_document_type"


def test_m_missing_source(db):
    ev = _event()
    db.add(ev)
    db.flush()
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        side_effect=SaleCorrectionError("SOURCE_DOCUMENT_MISSING", "Brak pierwotnej faktury"),
    ):
        r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is False
        assert r.data["error_code"] == "source_document_missing"


def test_n_sequence_warehouse_then_correction(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="seq",
        effects=[
            {"position": 0, "effect_type": EFFECT_WAREHOUSE_COMMIT, "config": {}, "enabled": True},
            {"position": 1, "effect_type": EFFECT_GENERATE_SALE_CORRECTION, "config": {}, "enabled": True},
        ],
        source=SOURCE_STATUS_ACTION,
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is True


def test_o_correction_before_warehouse_blocked(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="bad-order-fx",
        effects=[
            {"position": 0, "effect_type": EFFECT_GENERATE_SALE_CORRECTION, "config": {}, "enabled": True},
            {"position": 1, "effect_type": EFFECT_WAREHOUSE_COMMIT, "config": {}, "enabled": True},
        ],
        source=SOURCE_STATUS_ACTION,
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is False
    assert pf.blocked_code == "invalid_effect_order"


def test_p_failure_stops_later_email(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="stop",
        effects=[
            {"position": 0, "effect_type": EFFECT_GENERATE_SALE_CORRECTION, "config": {}, "enabled": True},
            {
                "position": 1,
                "effect_type": EFFECT_SEND_EMAIL,
                "config": {"template_id": 1, "recipient_type": "CUSTOMER"},
                "enabled": True,
            },
        ],
        source=SOURCE_STATUS_ACTION,
    )
    db.commit()
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        side_effect=SaleCorrectionError("RETURN_NOT_READY", "not ready"),
    ), patch(
        "backend.services.automation.effects.send_email.execute_send_email"
    ) as send:
        out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_RETURN, entity_id=50, dry_run=False)
        db.commit()
        assert out["status"] == EXEC_FAILED
        send.assert_not_called()


def test_u_status_action_no_duplicate_correction(db):
    rule = upsert_status_action_bundle(
        db,
        tenant_id=1,
        entity_type=ENTITY_RETURN,
        status_id=7,
        warehouse_id=1,
        effects=[
            {"position": 0, "effect_type": "warehouse_commit", "config": {}, "enabled": True},
            {"position": 1, "effect_type": "generate_sale_correction", "config": {}, "enabled": True},
            {"position": 2, "effect_type": "generate_sale_correction", "config": {}, "enabled": True},
        ],
    )
    db.commit()
    keys = [(e.effect_type, e.enabled) for e in sorted(rule.effects, key=lambda x: x.position)]
    assert keys.count(("generate_sale_correction", True)) == 1


def test_x_tenant_isolation(db):
    ev = _event(tenant_id=1, entity_id=50)
    db.add(ev)
    db.flush()
    # Return exists only for tenant 1; query filters by event.tenant_id
    with patch(
        "backend.services.automation.effects.generate_sale_correction.issue_sale_correction_for_return",
        return_value=_fake_doc(),
    ) as issue:
        r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
        assert r.ok is True
        assert issue.call_args.kwargs["tenant_id"] == 1


def test_y_wrong_entity_runtime(db):
    ev = _event(entity_type=ENTITY_ORDER)
    db.add(ev)
    db.flush()
    r = execute_generate_sale_correction(db, config={}, event=ev, actor_user_id=1)
    assert r.ok is False
    assert r.data["error_code"] == "unsupported_entity_for_effect"


def test_status_action_illegal_order_raises(db):
    with pytest.raises(ValueError, match="invalid_effect_order"):
        upsert_status_action_bundle(
            db,
            tenant_id=1,
            entity_type=ENTITY_RETURN,
            status_id=9,
            warehouse_id=1,
            effects=[
                {"position": 0, "effect_type": "generate_sale_correction", "config": {}, "enabled": True},
                {"position": 1, "effect_type": "warehouse_commit", "config": {}, "enabled": True},
            ],
        )
