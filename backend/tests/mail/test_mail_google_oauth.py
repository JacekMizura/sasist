"""Google OAuth + Gmail API provider tests (mocked HTTP)."""

from __future__ import annotations

import base64
import json
from datetime import datetime, timedelta
import email
from email.message import EmailMessage
from unittest.mock import MagicMock, patch

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.mail import (
    PROVIDER_GOOGLE_OAUTH,
    PROVIDER_MANUAL,
    MailAccount,
    MailConversation,
    MailMessage,
    MSG_DIRECTION_INBOUND,
)
from backend.models.messaging import EMAIL_SENT, OutboundEmailMessage
from backend.models.tenant import Tenant
from backend.services.mail.google import gmail_client as gc
from backend.services.mail.google.oauth_state import OAuthStateError, create_oauth_state, verify_oauth_state
from backend.services.mail.google.oauth_service import (
    build_google_authorization_url,
    disconnect_google_account,
    handle_google_oauth_callback,
)
from backend.services.mail.inbound.gmail_connector import GmailApiInboundConnector
from backend.services.mail.inbound.sync_service import ingest_inbound_message, sync_account_inbound
from backend.services.mail.inbound.base_connector import FetchedInboundMessage
from backend.services.messaging.delivery import deliver_one_outbound_email
from backend.services.messaging.gmail_api_provider import GmailApiEmailProvider
from backend.services.messaging.provider_routing import resolve_outbound_email_provider
from backend.services.messaging.providers import EmailSendRequest
from backend.services.secrets.credential_cipher import decrypt_secret, encrypt_secret, reset_cipher_cache_for_tests


@pytest.fixture(autouse=True)
def _cipher(monkeypatch):
    monkeypatch.setenv("AUTH_SECRET_KEY", "test-auth-secret-key-min-32-chars!!")
    reset_cipher_cache_for_tests()


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, MailAccount, MailConversation, MailMessage, OutboundEmailMessage):
        model.__table__.create(engine, checkfirst=True)
    session = sessionmaker(bind=engine)()
    session.add(Tenant(id=1, name="T1", default_warehouse_id=1))
    session.add(Tenant(id=2, name="T2", default_warehouse_id=1))
    session.commit()
    yield session
    session.close()


def _google_account(db, *, tenant_id=1, email="shop@gmail.com") -> MailAccount:
    acc = MailAccount(
        tenant_id=tenant_id,
        name="Gmail",
        email_address=email,
        provider_type=PROVIDER_GOOGLE_OAUTH,
        google_email=email,
        google_subject="sub-123",
        google_refresh_token_ciphertext=encrypt_secret("refresh-token"),
        google_access_token_ciphertext=encrypt_secret("access-token"),
        google_access_token_expires_at=datetime.utcnow() + timedelta(hours=1),
        oauth_connected_at=datetime.utcnow(),
        is_active=True,
        last_sync_uid=0,
    )
    db.add(acc)
    db.flush()
    return acc


def test_oauth_state_roundtrip():
    state = create_oauth_state(tenant_id=1, user_id=5, account_id=None)
    payload = verify_oauth_state(state)
    assert payload["tenant_id"] == 1
    assert payload["user_id"] == 5


def test_oauth_state_tamper_rejected():
    state = create_oauth_state(tenant_id=1, user_id=1)
    bad = state[:-2] + "xx"
    with pytest.raises(OAuthStateError):
        verify_oauth_state(bad)


def test_build_authorization_url(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "sec")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_URI", "https://api.example.com/api/mail/google/callback")
    url = build_google_authorization_url(tenant_id=1, user_id=2)
    assert "accounts.google.com" in url
    assert "client_id=cid" in url


def test_callback_encrypts_refresh_token(db, monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "sec")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_URI", "https://api.example.com/cb")
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")
    state = create_oauth_state(tenant_id=1, user_id=1)
    monkeypatch.setattr(
        "backend.services.mail.google.oauth_service.exchange_authorization_code",
        lambda **kwargs: {
            "access_token": "at",
            "refresh_token": "rt-secret",
            "expires_in": 3600,
            "scope": "gmail.send",
        },
    )
    monkeypatch.setattr(
        "backend.services.mail.google.oauth_service.fetch_google_userinfo",
        lambda **kwargs: {"email": "user@gmail.com", "sub": "google-sub"},
    )
    redirect = handle_google_oauth_callback(db, code="code", state=state)
    db.commit()
    assert "google=connected" in redirect
    acc = db.query(MailAccount).one()
    assert acc.provider_type == PROVIDER_GOOGLE_OAUTH
    assert decrypt_secret(acc.google_refresh_token_ciphertext) == "rt-secret"
    assert acc.google_refresh_token_ciphertext != "rt-secret"


def test_callback_cross_tenant_account_rejected(db, monkeypatch):
    acc = _google_account(db, tenant_id=2)
    db.commit()
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_OAUTH_CLIENT_SECRET", "sec")
    monkeypatch.setenv("GOOGLE_OAUTH_REDIRECT_URI", "https://api.example.com/cb")
    monkeypatch.setenv("FRONTEND_BASE_URL", "https://app.example.com")
    state = create_oauth_state(tenant_id=1, user_id=1, account_id=acc.id)
    monkeypatch.setattr(
        "backend.services.mail.google.oauth_service.exchange_authorization_code",
        lambda **kwargs: {"access_token": "at", "refresh_token": "rt", "expires_in": 3600},
    )
    monkeypatch.setattr(
        "backend.services.mail.google.oauth_service.fetch_google_userinfo",
        lambda **kwargs: {"email": "x@gmail.com", "sub": "s"},
    )
    redirect = handle_google_oauth_callback(db, code="c", state=state)
    assert "google=error" in redirect
    assert db.query(MailAccount).filter(MailAccount.tenant_id == 1).count() == 0


def test_disconnect_clears_tokens(db, monkeypatch):
    acc = _google_account(db)
    db.commit()
    monkeypatch.setattr(gc, "revoke_refresh_token", lambda token: None)
    disconnect_google_account(db, tenant_id=1, account_id=acc.id)
    db.commit()
    db.refresh(acc)
    assert acc.google_refresh_token_ciphertext is None
    assert acc.is_active is False


def test_gmail_provider_sends_mime_with_rfc_headers(db, monkeypatch):
    acc = _google_account(db)
    db.commit()
    captured: dict = {}

    def fake_send(**kwargs):
        captured.update(kwargs)
        return "gmail-msg-1"

    monkeypatch.setattr(
        "backend.services.messaging.gmail_api_provider.ensure_valid_access_token",
        lambda db_, a: "token",
    )
    monkeypatch.setattr(
        "backend.services.messaging.gmail_api_provider.send_gmail_message",
        fake_send,
    )
    provider = GmailApiEmailProvider(db, acc)
    result = provider.send(
        EmailSendRequest(
            to_address="buyer@example.com",
            subject="Re: Hi",
            body_text="Hello",
            idempotency_key="k1",
            from_address="shop@gmail.com",
            message_id="<out@shop.pl>",
            in_reply_to="<in@shop.pl>",
            references="<in@shop.pl>",
        )
    )
    assert result.provider == "gmail_api"
    assert result.provider_message_id == "gmail-msg-1"
    raw = captured["raw_mime"]
    msg = email.message_from_bytes(raw)
    assert msg["To"] == "buyer@example.com"
    assert msg["Message-ID"] == "<out@shop.pl>"
    assert msg["In-Reply-To"] == "<in@shop.pl>"


def test_gmail_provider_from_mismatch_rejected(db):
    acc = _google_account(db, email="shop@gmail.com")
    db.commit()
    provider = GmailApiEmailProvider(db, acc)
    with pytest.raises(Exception) as exc:
        provider.send(
            EmailSendRequest(
                to_address="a@b.com",
                subject="S",
                body_text="B",
                idempotency_key="k",
                from_address="other@gmail.com",
            )
        )
    assert exc.value.code == "invalid_sender"


def test_provider_routing_google_account(db):
    acc = _google_account(db)
    row = OutboundEmailMessage(
        tenant_id=1,
        entity_type="MAIL_CONVERSATION",
        entity_id=1,
        recipient_email="a@b.com",
        subject="S",
        body="B",
        status="PENDING",
        idempotency_key="reply-1",
        mail_account_id=acc.id,
    )
    db.add(row)
    db.commit()
    provider, _, _ = resolve_outbound_email_provider(db, row)
    assert provider.name == "gmail_api"


def test_manual_gmail_reply_delivery_sent(db, monkeypatch):
    acc = _google_account(db)
    row = OutboundEmailMessage(
        tenant_id=1,
        entity_type="MAIL_CONVERSATION",
        entity_id=1,
        recipient_email="buyer@example.com",
        subject="Re: Test",
        body="Reply",
        status="PENDING",
        idempotency_key="reply-gmail",
        mail_account_id=acc.id,
    )
    db.add(row)
    db.commit()
    monkeypatch.setattr(
        "backend.services.messaging.gmail_api_provider.ensure_valid_access_token",
        lambda db_, a: "token",
    )
    monkeypatch.setattr(
        "backend.services.messaging.gmail_api_provider.send_gmail_message",
        lambda **kwargs: "gm-99",
    )
    result = deliver_one_outbound_email(db, row)
    db.commit()
    db.refresh(row)
    assert result["status"] == EMAIL_SENT
    assert row.provider == "gmail_api"
    assert row.provider_message_id == "gm-99"


def test_gmail_inbound_duplicate_ignored(db, monkeypatch):
    acc = _google_account(db)
    db.commit()
    raw = (
        b"From: customer@example.com\r\n"
        b"To: shop@gmail.com\r\n"
        b"Subject: Hi\r\n"
        b"Message-ID: <dup@gmail.test>\r\n"
        b"\r\n"
        b"Body"
    )

    class FakeConnector:
        def fetch_batch(self, batch_size):
            return [
                FetchedInboundMessage(raw_bytes=raw, gmail_message_id="gm-1", gmail_thread_id="gt-1"),
                FetchedInboundMessage(raw_bytes=raw, gmail_message_id="gm-1", gmail_thread_id="gt-1"),
            ]

        def close(self):
            return None

    monkeypatch.setattr(
        "backend.services.mail.inbound.sync_service.find_customer_id_by_email",
        lambda db, tenant_id, email: None,
    )
    result = sync_account_inbound(db, acc, FakeConnector(), batch_size=10)
    assert result["created"] == 1
    assert result["duplicates"] == 1
    assert db.query(MailMessage).count() == 1


def test_gmail_revoked_token_failed(db, monkeypatch):
    acc = _google_account(db)
    row = OutboundEmailMessage(
        tenant_id=1,
        entity_type="MAIL_CONVERSATION",
        entity_id=1,
        recipient_email="a@b.com",
        subject="S",
        body="B",
        status="PENDING",
        idempotency_key="k",
        mail_account_id=acc.id,
    )
    db.add(row)
    db.commit()

    def boom(db_, account):
        raise gc.GmailApiError(
            "Połączenie z Google wygasło. Połącz konto ponownie.",
            code="oauth_revoked",
            transient=False,
        )

    monkeypatch.setattr("backend.services.messaging.gmail_api_provider.ensure_valid_access_token", boom)
    result = deliver_one_outbound_email(db, row)
    db.commit()
    assert result["status"] == "FAILED"
    assert result["error_code"] == "oauth_revoked"
