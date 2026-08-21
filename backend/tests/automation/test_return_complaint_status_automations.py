"""Phase 2 — RETURN / COMPLAINT UI status automations + STATUS_ACTION projection."""

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
from backend.models.complaint import Complaint
from backend.models.complaint_ui_status import ComplaintUiStatus
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.return_ui_status import ReturnUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.services.automation.complaint_ui_status import apply_complaint_panel_ui_status
from backend.services.automation.constants import (
    EFFECT_CHANGE_STATUS,
    ENTITY_COMPLAINT,
    ENTITY_ORDER,
    ENTITY_RETURN,
    MAX_AUTOMATION_DEPTH,
    SOURCE_STATUS_ACTION,
)
from backend.services.automation.return_ui_status import apply_return_panel_ui_status
from backend.services.automation.status_actions import (
    disable_status_action_rules_for_status,
    status_action_projection,
)
from backend.services.automation.store import create_rule, set_rule_enabled
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        Order,
        ReturnUiStatus,
        WmsOrderReturn,
        ComplaintUiStatus,
        Complaint,
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
    session.add(Tenant(id=2, name="T2", default_warehouse_id=2))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(Warehouse(id=2, tenant_id=2, name="WH2"))
    session.add(
        Order(id=100, tenant_id=1, warehouse_id=1, number="O-100", status="new", order_ui_status_id=None)
    )
    for sid, name in ((1, "RA"), (2, "RB"), (3, "RC")):
        session.add(
            ReturnUiStatus(
                id=sid,
                tenant_id=1,
                warehouse_id=1,
                name=name,
                main_group="NEW",
                is_active=True,
            )
        )
    session.add(
        ReturnUiStatus(
            id=9,
            tenant_id=1,
            warehouse_id=1,
            name="Inactive",
            main_group="NEW",
            is_active=False,
        )
    )
    session.add(
        WmsOrderReturn(
            id=50,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            rmz_number="RMZ-50",
            return_type="RMA",
            status_id=1,
            ui_status_id=1,
            lines_json="[]",
        )
    )
    for sid, name in ((11, "CA"), (12, "CB"), (13, "CC")):
        session.add(ComplaintUiStatus(id=sid, tenant_id=1, name=name, main_group="NEW"))
    session.add(
        Complaint(
            id=70,
            tenant_id=1,
            warehouse_id=1,
            title="C70",
            complaint_ui_status_id=11,
        )
    )
    session.add(
        OrderUiStatus(
            id=20,
            tenant_id=1,
            warehouse_id=1,
            name="OrdA",
            main_group="NEW",
            is_active=True,
        )
    )
    session.add(
        OrderUiStatus(
            id=21,
            tenant_id=1,
            warehouse_id=1,
            name="OrdB",
            main_group="NEW",
            is_active=True,
        )
    )
    session.commit()
    yield session
    session.close()


def _status_action(db, *, entity_type: str, trigger_status: int, target_status: int, warehouse_id=1, **kw):
    return create_rule(
        db,
        tenant_id=1,
        warehouse_id=warehouse_id,
        entity_type=entity_type,
        name=kw.get("name", f"SA {trigger_status}->{target_status}"),
        enabled=kw.get("enabled", True),
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": trigger_status},
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": target_status},
                "enabled": True,
            }
        ],
    )


def test_a_return_a_to_b_emits_one_event(db):
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(
        db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1
    )
    db.commit()
    events = (
        db.query(StatusTransitionEvent)
        .filter(
            StatusTransitionEvent.entity_type == ENTITY_RETURN,
            StatusTransitionEvent.entity_id == 50,
        )
        .all()
    )
    assert len(events) == 1
    assert events[0].old_status_key == "1"
    assert events[0].new_status_key == "2"
    assert row.ui_status_id == 2
    assert row.status_id == 1  # RMZ workflow untouched


def test_b_return_same_status_emits_zero(db):
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(
        db, row=row, sub_status_id=1, tenant_id=1, warehouse_id=1
    )
    db.commit()
    n = db.query(StatusTransitionEvent).filter(StatusTransitionEvent.entity_id == 50).count()
    assert n == 0


def test_c_complaint_a_to_b_emits_one(db):
    row = db.query(Complaint).get(70)
    apply_complaint_panel_ui_status(db, row=row, sub_status_id=12, tenant_id=1)
    db.commit()
    events = (
        db.query(StatusTransitionEvent)
        .filter(
            StatusTransitionEvent.entity_type == ENTITY_COMPLAINT,
            StatusTransitionEvent.entity_id == 70,
        )
        .all()
    )
    assert len(events) == 1
    assert events[0].old_status_key == "11"
    assert events[0].new_status_key == "12"


def test_d_retry_same_event_one_execution(db):
    _status_action(db, entity_type=ENTITY_RETURN, trigger_status=2, target_status=3)
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    event = db.query(StatusTransitionEvent).filter(StatusTransitionEvent.new_status_key == "2").one()
    from backend.services.automation.runner import run_automations_for_status_entered

    run_automations_for_status_entered(db, event=event)
    run_automations_for_status_entered(db, event=event)
    db.commit()
    n = db.query(AutomationExecution).filter(AutomationExecution.trigger_event_id == str(event.id)).count()
    assert n == 1


def test_e_return_a_b_a_b_two_legal_b_events(db):
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    apply_return_panel_ui_status(db, row=row, sub_status_id=1, tenant_id=1, warehouse_id=1)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    b_events = (
        db.query(StatusTransitionEvent)
        .filter(
            StatusTransitionEvent.entity_id == 50,
            StatusTransitionEvent.new_status_key == "2",
        )
        .all()
    )
    assert len(b_events) == 2


def test_f_return_status_action_change_status_chains(db):
    _status_action(db, entity_type=ENTITY_RETURN, trigger_status=2, target_status=3)
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.ui_status_id == 3
    keys = [e.new_status_key for e in db.query(StatusTransitionEvent).filter(StatusTransitionEvent.entity_id == 50).all()]
    assert "2" in keys and "3" in keys


def test_g_complaint_chain(db):
    _status_action(db, entity_type=ENTITY_COMPLAINT, trigger_status=12, target_status=13, warehouse_id=None)
    # warehouse_id None — recreate with None
    db.query(AutomationRule).delete()
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=None,
        entity_type=ENTITY_COMPLAINT,
        name="C chain",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 12},
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 13},
                "enabled": True,
            }
        ],
    )
    db.commit()
    row = db.query(Complaint).get(70)
    apply_complaint_panel_ui_status(db, row=row, sub_status_id=12, tenant_id=1)
    db.commit()
    assert row.complaint_ui_status_id == 13


def test_h_loop_depth_guard(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="ping",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 2},
        effects=[{"position": 0, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 3}, "enabled": True}],
    )
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="pong",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 3},
        effects=[{"position": 0, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 2}, "enabled": True}],
    )
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    n = db.query(StatusTransitionEvent).filter(StatusTransitionEvent.entity_id == 50).count()
    assert n <= MAX_AUTOMATION_DEPTH + 1


def test_i_disabled_rule(db):
    rule = _status_action(db, entity_type=ENTITY_RETURN, trigger_status=2, target_status=3)
    set_rule_enabled(db, rule, False)
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.ui_status_id == 2
    assert db.query(AutomationExecution).count() == 0


def test_j_inactive_target_rejected(db):
    _status_action(db, entity_type=ENTITY_RETURN, trigger_status=2, target_status=9)
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.ui_status_id == 2
    execs = db.query(AutomationExecution).all()
    assert len(execs) == 1
    assert execs[0].status == "FAILED"


def test_k_tenant_isolation(db):
    create_rule(
        db,
        tenant_id=2,
        warehouse_id=2,
        entity_type=ENTITY_RETURN,
        name="other tenant",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 2},
        effects=[{"position": 0, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 3}, "enabled": True}],
    )
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.ui_status_id == 2
    assert db.query(AutomationExecution).count() == 0


def test_l_warehouse_isolation(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=99,
        entity_type=ENTITY_RETURN,
        name="other wh",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 2},
        effects=[{"position": 0, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 3}, "enabled": True}],
    )
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.ui_status_id == 2


def test_m_n_status_action_projection_same_rule(db):
    rule = _status_action(db, entity_type=ENTITY_RETURN, trigger_status=1, target_status=2)
    db.commit()
    proj = status_action_projection(db, tenant_id=1, entity_type=ENTITY_RETURN, status_id=1, warehouse_id=1)
    assert len(proj) == 1
    assert proj[0]["id"] == rule.id
    assert proj[0]["source"] == SOURCE_STATUS_ACTION
    assert proj[0]["effects"][0]["effect_type"] == EFFECT_CHANGE_STATUS


def test_o_delete_status_disables_rule(db):
    rule = _status_action(db, entity_type=ENTITY_RETURN, trigger_status=1, target_status=2)
    db.commit()
    n = disable_status_action_rules_for_status(
        db, tenant_id=1, entity_type=ENTITY_RETURN, status_id=1, warehouse_id=1
    )
    db.commit()
    assert n == 1
    db.refresh(rule)
    assert rule.enabled is False
    assert db.query(AutomationRule).filter(AutomationRule.id == rule.id).count() == 1


def test_p_no_rmz_workflow_side_effects(db):
    row = db.query(WmsOrderReturn).get(50)
    before_status = row.status_id
    before_refund = row.refund_processing
    apply_return_panel_ui_status(db, row=row, sub_status_id=2, tenant_id=1, warehouse_id=1)
    db.commit()
    assert row.status_id == before_status
    assert row.refund_processing == before_refund
    assert row.warehouse_document_id is None


def test_q_order_automation_still_works(db):
    order = db.query(Order).get(100)
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="ord",
        trigger_config={"status_id": 20},
        effects=[{"position": 0, "effect_type": EFFECT_CHANGE_STATUS, "config": {"status_id": 21}, "enabled": True}],
    )
    db.commit()
    apply_order_panel_ui_status(db, order=order, sub_status_id=20, operator_user_id=None)
    db.commit()
    assert order.order_ui_status_id == 21
