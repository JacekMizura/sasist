"""Phase 2 mail conversation workflow tests."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.auth.permission_catalog import PERMISSION_KEYS
from backend.models.app_user import AppUser, UserPermission
from backend.models.complaint import Complaint
from backend.models.customer import Customer
from backend.models.mail import (
    CONV_PRIORITY_HIGH,
    CONV_STATUS_IN_PROGRESS,
    CONV_STATUS_OPEN,
    MailAccount,
    MailConversation,
    MailConversationAuditEvent,
    MailConversationReadState,
    MailConversationRelation,
    MailMessage,
    MSG_DIRECTION_INBOUND,
    MSG_DIRECTION_OUTBOUND,
    RELATION_ORDER,
)
from backend.models.messaging import EMAIL_FAILED, EMAIL_PENDING, OutboundEmailMessage
from backend.models.order import Order
from backend.models.return_status import ReturnStatus
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_order_return import WmsOrderReturn
from backend.services.mail.conversation_service import (
    ConversationListParams,
    get_conversation_detail,
    list_conversation_messages,
    list_conversations,
    mark_conversation_read,
    patch_conversation,
    send_conversation_reply,
    sidebar_counts,
)
from backend.services.messaging.providers import reset_memory_provider_for_tests


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Customer,
        AppUser,
        UserPermission,
        Order,
        Complaint,
        Warehouse,
        ReturnStatus,
        WmsOrderReturn,
        OutboundEmailMessage,
        MailAccount,
        MailConversation,
        MailConversationRelation,
        MailMessage,
        MailConversationReadState,
        MailConversationAuditEvent,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T1", default_warehouse_id=1))
    session.add(Tenant(id=2, name="T2", default_warehouse_id=1))
    session.add(Warehouse(id=1, tenant_id=1, name="WH1"))
    session.add(ReturnStatus(id=1, tenant_id=1, warehouse_id=1, name="New", type="in_progress"))
    session.add(Customer(id=10, tenant_id=1, first_name="Jan", last_name="Kowalski", email="jan@example.com"))
    session.add(AppUser(id=1, login="op1", password_hash="x", first_name="Op", last_name="One"))
    session.add(AppUser(id=2, login="op2", password_hash="x", first_name="Op", last_name="Two"))
    session.commit()
    yield session
    session.close()


def _seed_account(db) -> MailAccount:
    acc = MailAccount(
        tenant_id=1,
        name="Support",
        email_address="support@shop.pl",
        imap_host="i",
        imap_port=993,
        is_active=True,
    )
    db.add(acc)
    db.flush()
    return acc


def _seed_conversation(db, *, subject="Test", assigned_user_id=None, status=CONV_STATUS_OPEN) -> MailConversation:
    conv = MailConversation(
        tenant_id=1,
        subject=subject,
        customer_id=10,
        status=status,
        assigned_user_id=assigned_user_id,
        last_message_at=datetime.utcnow(),
        last_inbound_at=datetime.utcnow(),
        created_at=datetime.utcnow(),
    )
    db.add(conv)
    db.flush()
    return conv


def _seed_inbound(db, conv, account, *, sender="customer@example.com", body="Hello", msg_id=None) -> MailMessage:
    header = msg_id or f"<inbound-{conv.id}-{account.id}@shop.pl>"
    msg = MailMessage(
        tenant_id=1,
        conversation_id=conv.id,
        account_id=account.id,
        direction=MSG_DIRECTION_INBOUND,
        sender_email=sender,
        to_json='["support@shop.pl"]',
        subject=conv.subject,
        text_body=body,
        message_id_header=header,
        received_at=datetime.utcnow(),
    )
    db.add(msg)
    db.flush()
    return msg


def test_list_pagination_and_default_sort(db):
    acc = _seed_account(db)
    for i in range(30):
        conv = _seed_conversation(db, subject=f"Conv {i}")
        _seed_inbound(db, conv, acc, body=f"Body {i}", msg_id=f"<inbound-{i}@shop.pl>")
        conv.last_message_at = datetime.utcnow() - timedelta(minutes=i)
        db.add(conv)
    db.commit()

    items, total = list_conversations(
        db,
        ConversationListParams(tenant_id=1, user_id=1, page=1, page_size=25),
    )
    assert total == 30
    assert len(items) == 25
    assert items[0]["subject"] == "Conv 0"


def test_sidebar_counts(db):
    acc = _seed_account(db)
    c1 = _seed_conversation(db, assigned_user_id=1)
    _seed_inbound(db, c1, acc)
    c2 = _seed_conversation(db, assigned_user_id=1, status=CONV_STATUS_IN_PROGRESS)
    _seed_inbound(db, c2, acc)
    c2.last_outbound_at = datetime.utcnow()
    db.add(c2)
    c3 = _seed_conversation(db)
    _seed_inbound(db, c3, acc)
    db.commit()

    counts = sidebar_counts(db, tenant_id=1, user_id=1)
    assert counts["awaiting_me"] >= 1
    assert counts["assigned_to_me"] >= 2
    assert counts["unassigned"] >= 1
    assert counts["open"] >= 2


def test_search_by_subject_and_customer(db):
    acc = _seed_account(db)
    conv = _seed_conversation(db, subject="UnikalnyTematXYZ")
    _seed_inbound(db, conv, acc)
    db.commit()

    items, total = list_conversations(
        db,
        ConversationListParams(tenant_id=1, user_id=1, q="UnikalnyTemat"),
    )
    assert total == 1
    assert items[0]["conversation_id"] == conv.id

    _items2, total2 = list_conversations(
        db,
        ConversationListParams(tenant_id=1, user_id=1, q="Kowalski"),
    )
    assert total2 == 1


def test_tenant_isolation(db):
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    _seed_inbound(db, conv, acc)
    db.commit()

    _items, total = list_conversations(db, ConversationListParams(tenant_id=2, user_id=1))
    assert total == 0


def test_mark_read_per_user(db):
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    _seed_inbound(db, conv, acc)
    db.commit()

    assert mark_conversation_read(db, tenant_id=1, conversation_id=conv.id, user_id=1)
    db.commit()
    detail1 = get_conversation_detail(db, tenant_id=1, conversation_id=conv.id, user_id=1)
    detail2 = get_conversation_detail(db, tenant_id=1, conversation_id=conv.id, user_id=2)
    assert detail1["unread"] is False
    assert detail2["unread"] is True


def test_assignment_status_priority(db):
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    _seed_inbound(db, conv, acc)
    db.commit()

    updated = patch_conversation(
        db,
        tenant_id=1,
        conversation_id=conv.id,
        user_id=1,
        status=CONV_STATUS_IN_PROGRESS,
        priority=CONV_PRIORITY_HIGH,
        assigned_user_id=2,
        assign_user=True,
    )
    db.commit()
    assert updated is not None
    assert updated["status"] == CONV_STATUS_IN_PROGRESS
    assert updated["priority"] == CONV_PRIORITY_HIGH
    assert updated["assigned_user"]["id"] == 2


def test_reply_creates_mail_and_outbound(db):
    reset_memory_provider_for_tests()
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    _seed_inbound(db, conv, acc, sender="buyer@example.com", msg_id="<inbound-reply-test@shop.pl>")
    db.commit()

    result, err = send_conversation_reply(
        db,
        tenant_id=1,
        conversation_id=conv.id,
        user_id=1,
        body="Reply text",
        idempotency_key="reply-key-1",
    )
    assert err is None
    assert result is not None
    db.commit()

    mail_msg = db.query(MailMessage).filter(MailMessage.direction == MSG_DIRECTION_OUTBOUND).one()
    outbound = db.query(OutboundEmailMessage).one()
    assert mail_msg.outbound_message_id == outbound.id
    assert outbound.source == "MANUAL"
    assert outbound.conversation_id == conv.id
    assert outbound.mail_account_id == acc.id
    assert outbound.recipient_email == "buyer@example.com"
    assert outbound.status == EMAIL_PENDING
    assert outbound.in_reply_to == "<inbound-reply-test@shop.pl>"


def test_reply_idempotent_retry(db):
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    _seed_inbound(db, conv, acc)
    db.commit()

    r1, _ = send_conversation_reply(
        db,
        tenant_id=1,
        conversation_id=conv.id,
        user_id=1,
        body="Once",
        idempotency_key="idem-reply",
    )
    db.commit()
    r2, _ = send_conversation_reply(
        db,
        tenant_id=1,
        conversation_id=conv.id,
        user_id=1,
        body="Once",
        idempotency_key="idem-reply",
    )
    db.commit()
    assert db.query(OutboundEmailMessage).count() == 1
    assert db.query(MailMessage).filter(MailMessage.direction == MSG_DIRECTION_OUTBOUND).count() == 1
    assert r1["mail_message_id"] == r2["mail_message_id"]


def test_messages_chronological(db):
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    m1 = _seed_inbound(db, conv, acc, body="First")
    m2 = MailMessage(
        tenant_id=1,
        conversation_id=conv.id,
        account_id=acc.id,
        direction=MSG_DIRECTION_INBOUND,
        sender_email="a@b.pl",
        to_json="[]",
        subject="S",
        text_body="Second",
        received_at=datetime.utcnow() + timedelta(seconds=1),
    )
    db.add(m2)
    db.commit()

    msgs = list_conversation_messages(db, tenant_id=1, conversation_id=conv.id)
    assert msgs is not None
    assert [m["id"] for m in msgs] == [m1.id, m2.id]


def test_failed_outbound_reflected_in_message(db):
    reset_memory_provider_for_tests()
    acc = _seed_account(db)
    conv = _seed_conversation(db)
    _seed_inbound(db, conv, acc)
    db.commit()

    send_conversation_reply(
        db,
        tenant_id=1,
        conversation_id=conv.id,
        user_id=1,
        body="Fail me",
        idempotency_key="fail-key",
    )
    db.commit()
    outbound = db.query(OutboundEmailMessage).one()
    outbound.status = EMAIL_FAILED
    db.add(outbound)
    db.commit()

    msgs = list_conversation_messages(db, tenant_id=1, conversation_id=conv.id)
    outbound_msg = [m for m in msgs if m["direction"] == MSG_DIRECTION_OUTBOUND][0]
    assert outbound_msg["delivery_status"] == EMAIL_FAILED


def test_permission_catalog_includes_manage_conversations():
    assert "mail.manage_conversations" in PERMISSION_KEYS


def test_order_relation_search(db):
    acc = _seed_account(db)
    order = Order(id=100, tenant_id=1, warehouse_id=1, customer_id=10, number="ORD-9999")
    db.add(order)
    conv = _seed_conversation(db, subject="Order thread")
    db.add(
        MailConversationRelation(
            tenant_id=1,
            conversation_id=conv.id,
            relation_type=RELATION_ORDER,
            relation_id=100,
        )
    )
    _seed_inbound(db, conv, acc)
    db.commit()

    _items, total = list_conversations(
        db,
        ConversationListParams(tenant_id=1, user_id=1, q="ORD-9999"),
    )
    assert total == 1
