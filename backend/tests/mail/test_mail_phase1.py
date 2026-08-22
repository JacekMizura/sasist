"""Phase 1 mail module tests."""

from __future__ import annotations

import email
import os
from datetime import datetime
from email.message import EmailMessage

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.auth.permission_catalog import PERMISSION_KEYS
from backend.models.app_user import AppUser, UserPermission
from backend.models.messaging import OutboundEmailMessage
from backend.models.customer import Customer
from backend.models.mail import (
    MailAccount,
    MailConversation,
    MailConversationRelation,
    MailMessage,
    MSG_DIRECTION_INBOUND,
)
from backend.models.tenant import Tenant
from backend.services.mail.account_service import (
    account_to_dict,
    create_account,
    get_account_for_tenant,
    get_imap_password,
    get_smtp_password,
    update_account,
)
from backend.services.mail.connection_test import ConnectionTestResult, probe_account_connection
from backend.services.mail.inbound.imap_connector import InMemoryImapConnector
from backend.services.mail.inbound.message_parser import parse_inbound_email
from backend.services.mail.inbound.sync_service import ingest_inbound_message, sync_account_inbound
from backend.services.secrets.credential_cipher import encrypt_secret, reset_cipher_cache_for_tests
from backend.workers.mail_inbound_sync_worker import run_mail_inbound_sync_worker


def _make_raw_email(
    *,
    subject: str,
    from_addr: str,
    to_addr: str,
    body: str,
    message_id: str | None = None,
    in_reply_to: str | None = None,
    references: str | None = None,
) -> bytes:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    if message_id:
        msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    msg.set_content(body)
    return msg.as_bytes()


@pytest.fixture
def db(monkeypatch):
    monkeypatch.setenv("MAIL_CREDENTIALS_ENCRYPTION_KEY", "test-mail-key-stable-phase1")
    reset_cipher_cache_for_tests()
    engine = create_engine("sqlite:///:memory:")
    for model in (
        Tenant,
        Customer,
        AppUser,
        UserPermission,
        OutboundEmailMessage,
        MailAccount,
        MailConversation,
        MailConversationRelation,
        MailMessage,
    ):
        model.__table__.create(engine, checkfirst=True)
    Session = sessionmaker(bind=engine)
    session = Session()
    session.add(Tenant(id=1, name="T1", default_warehouse_id=1))
    session.add(Tenant(id=2, name="T2", default_warehouse_id=1))
    session.add(Customer(id=10, tenant_id=1, first_name="Jan", last_name="Kowalski", email="jan@example.com"))
    session.commit()
    yield session
    session.close()


def test_account_create_and_no_password_in_api(db):
    row = create_account(
        db,
        tenant_id=1,
        name="Support",
        email_address="support@shop.pl",
        imap_host="imap.shop.pl",
        imap_port=993,
        imap_security="SSL",
        imap_username="imap-user",
        imap_password="imap-secret",
        smtp_host="smtp.shop.pl",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="smtp-user",
        smtp_password="smtp-secret",
        is_send_only=False,
    )
    db.commit()
    payload = account_to_dict(row)
    assert payload["has_imap_password"] is True
    assert payload["has_smtp_password"] is True
    assert "password" not in payload
    assert "imap_password" not in payload
    assert get_imap_password(row) == "imap-secret"
    assert get_smtp_password(row) == "smtp-secret"


def test_update_without_password_preserves_secret(db):
    row = create_account(
        db,
        tenant_id=1,
        name="A",
        email_address="a@b.pl",
        imap_host="i",
        imap_port=993,
        imap_security="SSL",
        imap_username="u",
        imap_password="keep-me",
        smtp_host="s",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="u2",
        smtp_password="smtp-keep",
        is_send_only=False,
    )
    db.commit()
    update_account(db, row, name="Renamed")
    db.commit()
    assert get_imap_password(row) == "keep-me"
    assert get_smtp_password(row) == "smtp-keep"


def test_cross_tenant_account_access_forbidden(db):
    row = create_account(
        db,
        tenant_id=1,
        name="T1",
        email_address="x@y.pl",
        imap_host="i",
        imap_port=993,
        imap_security="SSL",
        imap_username="u",
        imap_password="p",
        smtp_host="s",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="u",
        smtp_password="p",
        is_send_only=False,
    )
    db.commit()
    assert get_account_for_tenant(db, tenant_id=2, account_id=row.id) is None


def test_inbound_creates_conversation_and_message(db):
    account = create_account(
        db,
        tenant_id=1,
        name="In",
        email_address="in@shop.pl",
        imap_host="i",
        imap_port=993,
        imap_security="SSL",
        imap_username="u",
        imap_password="p",
        smtp_host="s",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="u",
        smtp_password="p",
        is_send_only=False,
    )
    db.commit()
    raw = _make_raw_email(
        subject="Problem ze zwrotem",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="Dzień dobry",
        message_id="<msg-001@client>",
    )
    parsed = parse_inbound_email(raw)
    msg, created = ingest_inbound_message(db, account=account, parsed=parsed, imap_uid=100)
    db.commit()
    assert created is True
    assert msg is not None
    conv = db.query(MailConversation).filter(MailConversation.id == msg.conversation_id).one()
    assert conv.subject == "Problem ze zwrotem"
    assert conv.customer_id == 10
    assert conv.unread_count == 1
    assert msg.direction == MSG_DIRECTION_INBOUND


def test_duplicate_uid_ignored(db):
    account = _seed_account(db)
    raw = _make_raw_email(
        subject="A",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="x",
        message_id="<uid-dup@client>",
    )
    parsed = parse_inbound_email(raw)
    ingest_inbound_message(db, account=account, parsed=parsed, imap_uid=42)
    msg2, created2 = ingest_inbound_message(db, account=account, parsed=parsed, imap_uid=42)
    db.commit()
    assert created2 is False
    assert msg2 is None
    assert db.query(MailMessage).count() == 1


def test_duplicate_message_id_ignored(db):
    account = _seed_account(db)
    raw1 = _make_raw_email(
        subject="A",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="x",
        message_id="<same-id@client>",
    )
    raw2 = _make_raw_email(
        subject="B",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="y",
        message_id="<same-id@client>",
    )
    ingest_inbound_message(db, account=account, parsed=parse_inbound_email(raw1), imap_uid=1)
    msg2, created2 = ingest_inbound_message(
        db, account=account, parsed=parse_inbound_email(raw2), imap_uid=2
    )
    db.commit()
    assert created2 is False
    assert db.query(MailConversation).count() == 1


def test_in_reply_to_attaches_to_existing_conversation(db):
    account = _seed_account(db)
    raw1 = _make_raw_email(
        subject="Thread",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="first",
        message_id="<root@client>",
    )
    ingest_inbound_message(db, account=account, parsed=parse_inbound_email(raw1), imap_uid=1)
    raw2 = _make_raw_email(
        subject="Re: Thread",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="reply",
        message_id="<reply@client>",
        in_reply_to="<root@client>",
    )
    msg2, created2 = ingest_inbound_message(db, account=account, parsed=parse_inbound_email(raw2), imap_uid=2)
    db.commit()
    assert created2 is True
    assert db.query(MailConversation).count() == 1
    assert msg2 is not None


def test_references_attaches_to_existing_conversation(db):
    account = _seed_account(db)
    raw1 = _make_raw_email(
        subject="Root",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="first",
        message_id="<root-ref@client>",
    )
    ingest_inbound_message(db, account=account, parsed=parse_inbound_email(raw1), imap_uid=1)
    raw2 = _make_raw_email(
        subject="Re: Root",
        from_addr="jan@example.com",
        to_addr="in@shop.pl",
        body="second",
        message_id="<child@client>",
        references="<root-ref@client>",
    )
    ingest_inbound_message(db, account=account, parsed=parse_inbound_email(raw2), imap_uid=2)
    db.commit()
    assert db.query(MailConversation).count() == 1


def test_same_customer_unrelated_subjects_create_new_conversations(db):
    account = _seed_account(db)
    for i, subj in enumerate(("Zwrot #1", "Zamówienie #2")):
        raw = _make_raw_email(
            subject=subj,
            from_addr="jan@example.com",
            to_addr="in@shop.pl",
            body="body",
            message_id=f"<unrelated-{i}@client>",
        )
        ingest_inbound_message(db, account=account, parsed=parse_inbound_email(raw), imap_uid=10 + i)
    db.commit()
    assert db.query(MailConversation).count() == 2


def test_sync_cursor_advances(db):
    account = _seed_account(db)
    connector = InMemoryImapConnector()
    connector.add_message(1, _make_raw_email(
        subject="One", from_addr="a@b.pl", to_addr="in@shop.pl", body="1", message_id="<m1@x>"
    ))
    connector.add_message(2, _make_raw_email(
        subject="Two", from_addr="a@b.pl", to_addr="in@shop.pl", body="2", message_id="<m2@x>"
    ))
    sync_account_inbound(db, account, connector, batch_size=50)
    db.commit()
    assert account.last_sync_uid == 2
    assert db.query(MailMessage).count() == 2


def test_inactive_account_not_synced(db, monkeypatch):
    account = _seed_account(db)
    account.is_active = False
    db.commit()
    connector = InMemoryImapConnector()
    connector.add_message(1, _make_raw_email(
        subject="X", from_addr="a@b.pl", to_addr="in@shop.pl", body="x", message_id="<x@y>"
    ))

    def _fail_build(_row):
        raise AssertionError("should not build connector for inactive")

    monkeypatch.setattr(
        "backend.workers.mail_inbound_sync_worker.build_imap_connector_for_account",
        _fail_build,
    )
    # Worker still queries account but inactive is filtered out
    result = run_mail_inbound_sync_worker(db)
    assert result["accounts"] == 0


def test_send_only_account_skipped_by_sync(db):
    account = _seed_account(db, send_only=True)
    connector = InMemoryImapConnector()
    connector.add_message(1, _make_raw_email(
        subject="X", from_addr="a@b.pl", to_addr="in@shop.pl", body="x", message_id="<x@y>"
    ))
    out = sync_account_inbound(db, account, connector)
    assert out.get("skipped") is True


def test_worker_failure_on_one_account_does_not_block_other(db, monkeypatch):
    a1 = _seed_account(db, name="Bad")
    a2 = _seed_account(db, name="Good", email="good@shop.pl")

    def _build(row):
        if row.id == a1.id:
            raise RuntimeError("imap down")
        c = InMemoryImapConnector()
        c.add_message(1, _make_raw_email(
            subject="Ok", from_addr="jan@example.com", to_addr="good@shop.pl",
            body="hi", message_id="<ok@client>",
        ))
        return c

    monkeypatch.setattr(
        "backend.workers.mail_inbound_sync_worker.build_imap_connector_for_account",
        _build,
    )
    result = run_mail_inbound_sync_worker(db, limit_accounts=5)
    db.commit()
    assert result["accounts"] == 2
    errors = [r for r in result["results"] if "error" in r]
    created = [r for r in result["results"] if r.get("created", 0) >= 0 and "error" not in r]
    assert len(errors) >= 1
    assert any(r.get("created") == 1 for r in created)


def test_connection_send_only(monkeypatch, db):
    row = create_account(
        db,
        tenant_id=1,
        name="Send",
        email_address="out@shop.pl",
        imap_host=None,
        imap_port=None,
        imap_security=None,
        imap_username=None,
        imap_password=None,
        smtp_host="smtp",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="u",
        smtp_password="p",
        is_send_only=True,
    )
    db.commit()

    monkeypatch.setattr(
        "backend.services.mail.connection_test.test_smtp_connection",
        lambda **_: (True, "OK"),
    )
    result = probe_account_connection(row)
    assert result.ok is True
    assert result.imap_ok is None
    assert result.smtp_ok is True


def test_mail_permissions_exist():
    for key in ("mail.view", "mail.reply", "mail.manage_conversations", "mail.manage_accounts", "mail.manage_templates"):
        assert key in PERMISSION_KEYS


def _seed_account(db, *, name: str = "In", email: str = "in@shop.pl", send_only: bool = False) -> MailAccount:
    row = create_account(
        db,
        tenant_id=1,
        name=name,
        email_address=email,
        imap_host="i",
        imap_port=993,
        imap_security="SSL",
        imap_username="u",
        imap_password="p",
        smtp_host="s",
        smtp_port=587,
        smtp_security="TLS",
        smtp_username="u",
        smtp_password="p",
        is_send_only=send_only,
    )
    db.commit()
    return row
