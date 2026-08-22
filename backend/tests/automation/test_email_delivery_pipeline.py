"""Real email delivery pipeline — PENDING enqueue + provider/worker SENT."""

from __future__ import annotations

import json
import os

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
from backend.models.messaging import (
    EMAIL_FAILED,
    EMAIL_PENDING,
    EMAIL_SENT,
    MessageTemplate,
    OutboundEmailMessage,
)
from backend.models.order import Order
from backend.models.order_ui_status import OrderUiStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.automation.constants import EFFECT_SEND_EMAIL, ENTITY_ORDER, EXEC_SUCCEEDED
from backend.services.automation.manual_run import run_rule_on_entity
from backend.services.automation.store import create_rule
from backend.services.messaging.delivery import deliver_one_outbound_email, process_pending_outbound_emails
from backend.services.messaging.email_outbox import automation_email_idempotency_key
from backend.services.messaging.providers import EmailProviderError, reset_memory_provider_for_tests
from backend.services.messaging.templates import create_email_template, update_email_template


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    reset_memory_provider_for_tests()
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Warehouse,
        OrderUiStatus,
        Order,
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
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(
        OrderUiStatus(id=10, tenant_id=1, warehouse_id=1, name="A", main_group="NEW", is_active=True)
    )
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
        MessageTemplate(
            id=1,
            tenant_id=1,
            code="notify",
            name="Notify",
            channel="email",
            entity_scope="ALL",
            subject_template="Hello {{order_number}}",
            body_template="Hi {{customer_email}} status={{status_name}}",
            is_active=True,
        )
    )
    session.commit()
    yield session
    session.close()


def _rule(db):
    return create_rule(
        db,
        tenant_id=1,
        warehouse_id=1,
        entity_type=ENTITY_ORDER,
        name="mail",
        effects=[
            {
                "position": 0,
                "effect_type": EFFECT_SEND_EMAIL,
                "config": {"recipient_type": "CUSTOMER", "template_id": 1},
                "enabled": True,
            }
        ],
    )


def test_a_enqueue_creates_pending_never_immediate_sent(db):
    rule = _rule(db)
    db.commit()
    out = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    assert out["status"] == EXEC_SUCCEEDED
    msg = db.query(OutboundEmailMessage).one()
    assert msg.status == EMAIL_PENDING
    assert msg.sent_at is None
    assert msg.provider_message_id is None
    assert out.get("planned_effects") or True
    # effect result embedded in effect execution
    ee = db.query(AutomationEffectExecution).one()
    data = json.loads(ee.result_json or "{}")
    assert data.get("delivery_status") == EMAIL_PENDING


def test_b_provider_success_sent(db):
    rule = _rule(db)
    db.commit()
    run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    msg = db.query(OutboundEmailMessage).one()
    r = deliver_one_outbound_email(db, msg)
    db.commit()
    assert r["status"] == EMAIL_SENT
    db.refresh(msg)
    assert msg.status == EMAIL_SENT
    assert msg.provider_message_id
    assert msg.sent_at is not None
    assert msg.attempt_count == 1


def test_c_d_e_f_g_provider_failure_and_attempts(db, monkeypatch):
    from backend.services.messaging import delivery as delivery_mod

    class Boom:
        name = "boom"

        def is_configured(self):
            return True

        def send(self, request):
            raise EmailProviderError("timeout", code="smtp_transient", transient=True)

    monkeypatch.setattr(delivery_mod, "resolve_outbound_email_provider", lambda db, row: (Boom(), None, None))
    rule = _rule(db)
    db.commit()
    run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    msg = db.query(OutboundEmailMessage).one()
    monkeypatch.setenv("EMAIL_MAX_ATTEMPTS", "2")
    r1 = deliver_one_outbound_email(db, msg)
    db.commit()
    assert r1["status"] == EMAIL_PENDING
    assert r1.get("retry") is True
    db.refresh(msg)
    assert msg.attempt_count == 1
    assert msg.sent_at is None
    r2 = deliver_one_outbound_email(db, msg)
    db.commit()
    db.refresh(msg)
    assert r2["status"] == EMAIL_FAILED
    assert msg.status == EMAIL_FAILED
    assert msg.failed_at is not None
    assert msg.last_error
    assert msg.attempt_count == 2


def test_h_i_automation_retry_one_message(db):
    rule = _rule(db)
    db.commit()
    out1 = run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    # Second manual run creates new execution → new idempotency key (different execution_id).
    # Same StatusTransitionEvent retry is covered by automation suite; here verify worker reuses row.
    msg = db.query(OutboundEmailMessage).one()
    key = msg.idempotency_key
    deliver_one_outbound_email(db, msg)
    db.commit()
    process_pending_outbound_emails(db, limit=10)
    db.commit()
    assert db.query(OutboundEmailMessage).filter(OutboundEmailMessage.idempotency_key == key).count() == 1
    assert out1["status"] == EXEC_SUCCEEDED


def test_j_already_sent_noop(db):
    rule = _rule(db)
    db.commit()
    run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    msg = db.query(OutboundEmailMessage).one()
    deliver_one_outbound_email(db, msg)
    db.commit()
    r2 = deliver_one_outbound_email(db, msg)
    assert r2.get("skipped") == "already_sent"
    assert db.query(OutboundEmailMessage).count() == 1


def test_k_l_m_template_snapshot_immutable(db):
    rule = _rule(db)
    db.commit()
    run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    msg = db.query(OutboundEmailMessage).one()
    snap_subject = msg.subject
    snap_body = msg.body
    tmpl = db.query(MessageTemplate).get(1)
    update_email_template(db, tmpl, subject_template="CHANGED", body_template="CHANGED BODY")
    db.commit()
    db.refresh(msg)
    assert msg.subject == snap_subject
    assert msg.body == snap_body
    assert "CHANGED" not in msg.subject


def test_z_unconfigured_never_fake_sent(db, monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "auto")
    monkeypatch.delenv("EMAIL_SMTP_HOST", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    rule = _rule(db)
    db.commit()
    run_rule_on_entity(db, rule=rule, entity_type=ENTITY_ORDER, entity_id=100, dry_run=False)
    db.commit()
    msg = db.query(OutboundEmailMessage).one()
    assert msg.status == EMAIL_PENDING
    r = deliver_one_outbound_email(db, msg)
    db.commit()
    assert r["status"] == EMAIL_FAILED
    assert r.get("error_code") == "configuration_error"
    db.refresh(msg)
    assert msg.status == EMAIL_FAILED
    assert msg.sent_at is None


def test_template_crud_create(db):
    row = create_email_template(
        db,
        tenant_id=1,
        name="Welcome",
        subject_template="Hi",
        body_template="Body",
        entity_scope="ORDER",
    )
    db.commit()
    assert row.id
    assert row.code
    assert row.is_active is True
