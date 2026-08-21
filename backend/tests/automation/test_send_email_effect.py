"""send_email effect — ORDER/RETURN/COMPLAINT + idempotency + preflight."""

from __future__ import annotations

import json

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
from backend.models.messaging import MessageTemplate, OutboundEmailMessage
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.return_ui_status import ReturnUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.services.automation.complaint_ui_status import apply_complaint_panel_ui_status
from backend.services.automation.constants import (
    EFFECT_CHANGE_STATUS,
    EFFECT_SEND_EMAIL,
    ENTITY_COMPLAINT,
    ENTITY_ORDER,
    ENTITY_RETURN,
    EXEC_BLOCKED,
    EXEC_FAILED,
    EXEC_SUCCEEDED,
    SOURCE_STATUS_ACTION,
)
from backend.services.automation.manual_run import run_rule_on_entity
from backend.services.automation.preflight import validate_automation_runtime
from backend.services.automation.return_ui_status import apply_return_panel_ui_status
from backend.services.automation.runner import (
    emit_entity_status_entered_and_run,
    run_automations_for_status_entered,
)
from backend.services.automation.events import create_status_transition_event
from backend.services.automation.store import create_rule, rule_to_dict
from backend.services.messaging.email_outbox import automation_email_idempotency_key
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        ReturnUiStatus,
        ComplaintUiStatus,
        Order,
        WmsOrderReturn,
        Complaint,
        MessageTemplate,
        OutboundEmailMessage,
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
    for sid, name in ((10, "A"), (20, "B"), (30, "C")):
        session.add(
            OrderUiStatus(id=sid, tenant_id=1, warehouse_id=1, name=name, main_group="NEW", is_active=True)
        )
        session.add(
            ReturnUiStatus(id=sid, tenant_id=1, warehouse_id=1, name=f"R{name}", main_group="NEW", is_active=True)
        )
        session.add(ComplaintUiStatus(id=sid, tenant_id=1, name=f"C{name}", main_group="NEW"))
    session.add(
        Order(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            number="O-100",
            status="new",
            order_ui_status_id=10,
            order_channel="DIRECT_SALE",
            addresses_json=json.dumps({"billing": {"Email": "buyer@example.com"}}),
        )
    )
    session.add(
        Order(
            id=101,
            tenant_id=1,
            warehouse_id=1,
            number="O-101",
            status="new",
            order_ui_status_id=10,
            order_channel="DIRECT_SALE",
            addresses_json=None,
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
            status_id=10,
            ui_status_id=10,
            lines_json="[]",
        )
    )
    session.add(
        Complaint(
            id=70,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            title="C1",
            complaint_ui_status_id=10,
            customer_email="complaint@example.com",
        )
    )
    session.add(
        MessageTemplate(
            id=1,
            tenant_id=1,
            code="status_notify",
            name="Status notify",
            channel="email",
            entity_scope="ALL",
            subject_template="Hello {{order_number}}{{rmz_number}}{{complaint_number}}",
            body_template="Status {{status_name}} email={{customer_email}}",
            is_active=True,
        )
    )
    session.add(
        MessageTemplate(
            id=2,
            tenant_id=1,
            code="disabled",
            name="Disabled",
            channel="email",
            entity_scope="ALL",
            subject_template="X",
            body_template="Y",
            is_active=False,
        )
    )
    session.add(
        MessageTemplate(
            id=3,
            tenant_id=2,
            code="foreign",
            name="Foreign",
            channel="email",
            entity_scope="ALL",
            subject_template="X",
            body_template="Y",
            is_active=True,
        )
    )
    session.commit()
    yield session
    session.close()


def _email_effect(template_id: int = 1, position: int = 0):
    return {
        "position": position,
        "effect_type": EFFECT_SEND_EMAIL,
        "config": {"recipient_type": "CUSTOMER", "template_id": template_id},
        "enabled": True,
    }


def test_a_order_status_customer_email(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="mail-order",
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
        metadata={"execution": {"automatic": True}},
    )
    db.commit()
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    msgs = db.query(OutboundEmailMessage).all()
    assert len(msgs) == 1
    assert msgs[0].recipient_email == "buyer@example.com"
    assert msgs[0].template_id == 1
    assert msgs[0].status == "SENT"
    assert msgs[0].provider_message_id


def test_b_return_status_customer_email(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_RETURN,
        name="mail-ret",
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
        metadata={"execution": {"automatic": True}},
    )
    db.commit()
    row = db.query(WmsOrderReturn).get(50)
    apply_return_panel_ui_status(db, row=row, sub_status_id=20, tenant_id=1, warehouse_id=1)
    db.commit()
    msgs = db.query(OutboundEmailMessage).all()
    assert len(msgs) == 1
    assert msgs[0].recipient_email == "buyer@example.com"
    assert msgs[0].entity_type == ENTITY_RETURN


def test_c_complaint_status_customer_email(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_COMPLAINT,
        name="mail-c",
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
        metadata={"execution": {"automatic": True}},
    )
    db.commit()
    c = db.query(Complaint).get(70)
    apply_complaint_panel_ui_status(db, row=c, sub_status_id=20, tenant_id=1)
    db.commit()
    msgs = db.query(OutboundEmailMessage).all()
    assert len(msgs) == 1
    assert msgs[0].recipient_email == "complaint@example.com"


def test_d_missing_customer_email_failed(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="no-email",
        effects=[_email_effect()],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=101, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_FAILED
    assert "recipient_email_missing" in (out.get("error") or "")
    assert db.query(OutboundEmailMessage).count() == 0


def test_e_invalid_template_id_preflight_blocked(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="bad-tid",
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_SEND_EMAIL,
                "config": {"recipient_type": "CUSTOMER", "template_id": 0},
                "enabled": True,
            }
        ],
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is False
    assert pf.blocked_code == "invalid_effect"


def test_f_foreign_tenant_template_failed(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="foreign",
        effects=[_email_effect(template_id=3)],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    assert out["status"] == EXEC_FAILED
    assert "template_wrong_tenant" in (out.get("error") or "")
    assert db.query(OutboundEmailMessage).count() == 0


def test_g_disabled_template_failed(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="dis",
        effects=[_email_effect(template_id=2)],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    assert out["status"] == EXEC_FAILED
    assert "template_inactive" in (out.get("error") or "")


def test_h_retry_same_event_one_email(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="once",
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
        metadata={"execution": {"automatic": True}},
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
    run_automations_for_status_entered(db, event=event)
    db.commit()
    assert db.query(OutboundEmailMessage).count() == 1


def test_i_crash_retry_after_enqueue_one_email(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="crash",
        effects=[_email_effect()],
    )
    db.commit()
    out1 = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out1["status"] == EXEC_SUCCEEDED
    # Simulate re-run of same effect with same execution/effect ids via outbox key
    ex = db.query(AutomationExecution).order_by(AutomationExecution.id.desc()).first()
    ee = db.query(AutomationEffectExecution).filter(AutomationEffectExecution.execution_id == ex.id).first()
    key = automation_email_idempotency_key(int(ex.id), int(ee.effect_id))
    assert db.query(OutboundEmailMessage).filter(OutboundEmailMessage.idempotency_key == key).count() == 1
    # Manual second enqueue path
    from backend.services.messaging.email_outbox import enqueue_or_get_outbound_email
    from backend.services.messaging.templates import get_active_email_template

    tmpl, _ = get_active_email_template(db, tenant_id=1, template_id=1, entity_type=ENTITY_ORDER)
    msg, created = enqueue_or_get_outbound_email(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        template=tmpl,
        recipient_email="buyer@example.com",
        recipient_type="CUSTOMER",
        context={},
        idempotency_key=key,
        automation_execution_id=int(ex.id),
        automation_effect_id=int(ee.effect_id),
    )
    assert created is False
    assert db.query(OutboundEmailMessage).count() == 1


def test_j_a_b_a_b_two_emails(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="toggle",
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
        metadata={"execution": {"automatic": True}},
    )
    db.commit()
    order = db.query(Order).get(100)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    apply_order_panel_ui_status(db, order=order, sub_status_id=10)
    apply_order_panel_ui_status(db, order=order, sub_status_id=20)
    db.commit()
    assert db.query(OutboundEmailMessage).count() == 2


def test_k_email_then_change_status(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="em-then-st",
        effects=[
            _email_effect(position=0),
            {
                "position": 1,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 30},
                "enabled": True,
            },
        ],
        metadata={"execution": {"automatic": False}},
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    assert db.query(OutboundEmailMessage).count() == 1
    assert db.query(Order).get(100).order_ui_status_id == 30


def test_l_email_fail_blocks_change_status(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="fail-first",
        effects=[
            _email_effect(template_id=2, position=0),
            {
                "position": 1,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 30},
                "enabled": True,
            },
        ],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_FAILED
    assert db.query(Order).get(100).order_ui_status_id == 10
    assert db.query(OutboundEmailMessage).count() == 0


def test_m_change_status_then_email(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="st-then-em",
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_CHANGE_STATUS,
                "config": {"status_id": 20},
                "enabled": True,
            },
            _email_effect(position=1),
        ],
        metadata={"execution": {"automatic": False}},
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    assert db.query(Order).get(100).order_ui_status_id == 20
    assert db.query(OutboundEmailMessage).count() == 1


def test_n_status_action_saves_send_email(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="sa-mail",
        source=SOURCE_STATUS_ACTION,
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
    )
    db.commit()
    d = rule_to_dict(rule)
    assert d["runtime_ready"] is True
    assert d["effects"][0]["effect_type"] == EFFECT_SEND_EMAIL
    assert d["effects"][0]["config"]["template_id"] == 1


def test_o_legacy_send_message_maps_to_send_email(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="legacy-msg",
        effects=[
            {
                "position": 0,
                "effect_type": "send_message",
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": True,
            }
        ],
    )
    db.commit()
    pf = validate_automation_runtime(rule)
    assert pf.ok is True
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    assert db.query(OutboundEmailMessage).count() == 1


def test_p_tenant_isolation(db):
    rule = create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="iso",
        effects=[_email_effect(template_id=3)],
    )
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    assert out["status"] == EXEC_FAILED


def test_q_warehouse_scope_trigger(db):
    create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="wh",
        trigger_config={"status_id": 20},
        effects=[_email_effect()],
        metadata={"execution": {"automatic": True}},
    )
    db.commit()
    # event for same warehouse matches
    emit_entity_status_entered_and_run(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        entity_id=100,
        previous_status_id=10,
        new_status_id=20,
    )
    db.commit()
    assert db.query(OutboundEmailMessage).count() == 1
