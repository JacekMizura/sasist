"""Resend email provider + delivery integration tests (no live API calls)."""

from __future__ import annotations

from unittest.mock import MagicMock

import httpx
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.models.mail import MailAccount, MailConversation, MailMessage, MSG_DIRECTION_INBOUND
from backend.models.messaging import EMAIL_FAILED, EMAIL_PENDING, EMAIL_SENT, OutboundEmailMessage
from backend.models.tenant import Tenant
from backend.services.messaging.delivery import deliver_one_outbound_email
from backend.services.messaging.email_outbox import enqueue_manual_reply_email
from backend.services.messaging.providers import (
    EmailSendRequest,
    MemoryEmailProvider,
    SmtpEmailProvider,
    get_email_provider,
    reset_memory_provider_for_tests,
)
from backend.services.messaging import resend_provider as resend_mod
from backend.services.messaging.resend_provider import ResendEmailProvider, _build_resend_payload


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    monkeypatch.delenv("EMAIL_SMTP_HOST", raising=False)
    monkeypatch.delenv("EMAIL_SMTP_PASSWORD", raising=False)
    monkeypatch.delenv("RESEND_API_KEY", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)


def test_resend_provider_selected_when_configured(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    monkeypatch.setenv("EMAIL_FROM", "Sasist <noreply@example.com>")
    provider = get_email_provider()
    assert isinstance(provider, ResendEmailProvider)
    assert provider.is_configured() is True


def test_resend_missing_api_key_is_unconfigured(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    provider = get_email_provider()
    assert provider.name == "unconfigured"
    assert provider.is_configured() is False


def test_resend_missing_email_from_is_unconfigured(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test_key")
    provider = get_email_provider()
    assert provider.name == "unconfigured"
    assert provider.is_configured() is False


def test_build_payload_maps_core_fields():
    req = EmailSendRequest(
        to_address="buyer@example.com",
        subject="Hello",
        body_text="Body text",
        idempotency_key="ae:1:2",
        from_address="shop@verified.com",
    )
    payload = _build_resend_payload(req, "fallback@example.com")
    assert payload["from"] == "shop@verified.com"
    assert payload["to"] == ["buyer@example.com"]
    assert payload["subject"] == "Hello"
    assert payload["text"] == "Body text"
    assert "headers" not in payload


def test_build_payload_uses_default_from_when_missing():
    req = EmailSendRequest(
        to_address="a@b.com",
        subject="S",
        body_text="B",
        idempotency_key="k",
    )
    payload = _build_resend_payload(req, "default@example.com")
    assert payload["from"] == "default@example.com"


def test_build_payload_includes_rfc_headers():
    req = EmailSendRequest(
        to_address="a@b.com",
        subject="Re: Hi",
        body_text="Reply",
        idempotency_key="reply-1",
        message_id="<new-msg@shop.pl>",
        in_reply_to="<inbound@shop.pl>",
        references="<root@shop.pl> <inbound@shop.pl>",
    )
    payload = _build_resend_payload(req, "shop@shop.pl")
    assert payload["headers"]["Message-ID"] == "<new-msg@shop.pl>"
    assert payload["headers"]["In-Reply-To"] == "<inbound@shop.pl>"
    assert payload["headers"]["References"] == "<root@shop.pl> <inbound@shop.pl>"


def test_resend_send_posts_correct_request(monkeypatch):
    captured: dict = {}

    def fake_post(*, api_key, payload, idempotency_key, timeout):
        captured["api_key"] = api_key
        captured["payload"] = payload
        captured["idempotency_key"] = idempotency_key
        return "resend-msg-123"

    monkeypatch.setattr(resend_mod, "_post_resend_email", fake_post)
    provider = ResendEmailProvider(api_key="re_secret", from_address="noreply@example.com")
    result = provider.send(
        EmailSendRequest(
            to_address="to@example.com",
            subject="Subj",
            body_text="Text",
            idempotency_key="idem-key-99",
            message_id="<m@d.com>",
            in_reply_to="<p@d.com>",
            references="<p@d.com>",
        )
    )
    assert captured["api_key"] == "re_secret"
    assert captured["idempotency_key"] == "idem-key-99"
    assert captured["payload"]["to"] == ["to@example.com"]
    assert captured["payload"]["headers"]["Message-ID"] == "<m@d.com>"
    assert result.provider == "resend"
    assert result.provider_message_id == "resend-msg-123"


def test_resend_http_success_parses_message_id(monkeypatch):
    response = httpx.Response(200, json={"id": "4ef4abc123"})

    class FakeClient:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, url, headers=None, json=None):
            assert url == resend_mod.RESEND_API_URL
            assert headers["Authorization"] == "Bearer re_key"
            assert headers["Idempotency-Key"] == "my-key"
            assert json["text"] == "hello"
            return response

    monkeypatch.setattr(resend_mod.httpx, "Client", lambda timeout: FakeClient())
    msg_id = resend_mod._post_resend_email(
        api_key="re_key",
        payload={"from": "a@b.com", "to": ["c@d.com"], "subject": "S", "text": "hello"},
        idempotency_key="my-key",
    )
    assert msg_id == "4ef4abc123"


def test_resend_4xx_is_permanent_error():
    response = httpx.Response(422, json={"message": "Invalid from"})
    with pytest.raises(resend_mod.EmailProviderError) as exc:
        resend_mod._raise_for_resend_response(response)
    assert exc.value.transient is False
    assert exc.value.code == "validation_error"


def test_resend_429_is_transient_error():
    response = httpx.Response(429, json={"message": "Too many requests"})
    with pytest.raises(resend_mod.EmailProviderError) as exc:
        resend_mod._raise_for_resend_response(response)
    assert exc.value.transient is True
    assert exc.value.code == "rate_limit"


def test_resend_5xx_is_transient_error():
    response = httpx.Response(503, json={"message": "Unavailable"})
    with pytest.raises(resend_mod.EmailProviderError) as exc:
        resend_mod._raise_for_resend_response(response)
    assert exc.value.transient is True


def test_delivery_resend_success_marks_sent(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@shop.pl")

    monkeypatch.setattr(
        resend_mod,
        "_post_resend_email",
        lambda **kwargs: "resend-id-42",
    )

    engine = create_engine("sqlite:///:memory:")
    Tenant.__table__.create(engine, checkfirst=True)
    OutboundEmailMessage.__table__.create(engine, checkfirst=True)
    db = sessionmaker(bind=engine)()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    row = OutboundEmailMessage(
        tenant_id=1,
        entity_type="ORDER",
        entity_id=1,
        recipient_email="buyer@example.com",
        subject="Hi",
        body="Body",
        status=EMAIL_PENDING,
        idempotency_key="ae:9:1",
    )
    db.add(row)
    db.commit()

    result = deliver_one_outbound_email(db, row)
    db.commit()
    db.refresh(row)

    assert result["status"] == EMAIL_SENT
    assert row.provider == "resend"
    assert row.provider_message_id == "resend-id-42"
    assert row.sent_at is not None


def test_delivery_resend_transient_retries_then_fails(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@shop.pl")
    monkeypatch.setenv("EMAIL_MAX_ATTEMPTS", "2")

    def boom(**kwargs):
        raise resend_mod.EmailProviderError("timeout", code="timeout", transient=True)

    monkeypatch.setattr(resend_mod, "_post_resend_email", boom)

    engine = create_engine("sqlite:///:memory:")
    Tenant.__table__.create(engine, checkfirst=True)
    OutboundEmailMessage.__table__.create(engine, checkfirst=True)
    db = sessionmaker(bind=engine)()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    row = OutboundEmailMessage(
        tenant_id=1,
        entity_type="ORDER",
        entity_id=1,
        recipient_email="buyer@example.com",
        subject="Hi",
        body="Body",
        status=EMAIL_PENDING,
        idempotency_key="ae:9:2",
    )
    db.add(row)
    db.commit()

    r1 = deliver_one_outbound_email(db, row)
    db.commit()
    assert r1["status"] == EMAIL_PENDING
    r2 = deliver_one_outbound_email(db, row)
    db.commit()
    db.refresh(row)
    assert r2["status"] == EMAIL_FAILED
    assert row.status == EMAIL_FAILED


def test_memory_provider_still_works(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "memory")
    reset_memory_provider_for_tests()
    provider = get_email_provider()
    assert isinstance(provider, MemoryEmailProvider)
    result = provider.send(
        EmailSendRequest(
            to_address="a@b.com",
            subject="S",
            body_text="B",
            idempotency_key="k1",
        )
    )
    assert result.provider == "memory"
    assert len(provider.sent) == 1


def test_smtp_provider_still_selected(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "smtp")
    monkeypatch.setenv("EMAIL_SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("EMAIL_FROM", "noreply@example.com")
    provider = get_email_provider()
    assert isinstance(provider, SmtpEmailProvider)
    assert provider.host == "smtp.example.com"


def test_gmail_manual_reply_blocked_on_resend(monkeypatch):
    monkeypatch.setenv("EMAIL_PROVIDER", "resend")
    monkeypatch.setenv("RESEND_API_KEY", "re_test")
    monkeypatch.setenv("EMAIL_FROM", "noreply@shop.pl")

    post_mock = MagicMock(return_value="should-not-be-called")
    monkeypatch.setattr(resend_mod, "_post_resend_email", post_mock)

    engine = create_engine("sqlite:///:memory:")
    for model in (Tenant, MailAccount, MailConversation, MailMessage, OutboundEmailMessage):
        model.__table__.create(engine, checkfirst=True)
    db = sessionmaker(bind=engine)()
    db.add(Tenant(id=1, name="T", default_warehouse_id=1))
    acc = MailAccount(
        tenant_id=1,
        name="Gmail",
        email_address="shop@gmail.com",
        is_active=True,
    )
    db.add(acc)
    db.flush()
    conv = MailConversation(tenant_id=1, subject="Test")
    db.add(conv)
    db.flush()
    mail_msg = MailMessage(
        tenant_id=1,
        conversation_id=conv.id,
        account_id=acc.id,
        direction=MSG_DIRECTION_INBOUND,
        sender_email="customer@example.com",
        to_json='["shop@gmail.com"]',
        subject="Test",
        text_body="Hi",
    )
    db.add(mail_msg)
    db.flush()

    outbound, _ = enqueue_manual_reply_email(
        db,
        tenant_id=1,
        conversation_id=conv.id,
        mail_account_id=acc.id,
        mail_message_id=mail_msg.id,
        entity_type="MAIL_CONVERSATION",
        entity_id=conv.id,
        recipient_email="customer@example.com",
        subject="Re: Test",
        body="Reply",
        sent_by_user_id=1,
        message_id_header="<reply@gmail-test>",
        in_reply_to="<inbound@gmail-test>",
        references_header="<inbound@gmail-test>",
        idempotency_key="reply-gmail-block",
    )
    db.commit()

    result = deliver_one_outbound_email(db, outbound)
    db.commit()
    db.refresh(outbound)

    post_mock.assert_not_called()
    assert result["status"] == EMAIL_FAILED
    assert result["error_code"] == "gmail_oauth_required"
    assert "Google OAuth" in (outbound.last_error or "")
    assert outbound.status == EMAIL_FAILED
