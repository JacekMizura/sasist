"""Deliver PENDING outbound emails via EmailProvider (worker entrypoint)."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.messaging import (
    EMAIL_FAILED,
    EMAIL_PENDING,
    EMAIL_SENDING,
    EMAIL_SENT,
    OutboundEmailMessage,
)
from .email_outbox import normalize_outbound_status
from .providers import EmailProviderError, EmailSendRequest, get_email_provider

logger = logging.getLogger(__name__)

_GMAIL_OAUTH_REQUIRED_MSG = (
    "Adresy Gmail wymagają połączenia konta przez Google OAuth / Gmail API."
)
_GMAIL_DOMAINS = frozenset({"gmail.com", "googlemail.com"})


def _sender_domain(email_address: str | None) -> str | None:
    raw = (email_address or "").strip()
    if "<" in raw and ">" in raw:
        start = raw.rfind("<") + 1
        end = raw.rfind(">")
        raw = raw[start:end].strip()
    if "@" not in raw:
        return None
    return raw.rsplit("@", 1)[-1].strip().lower()


def is_gmail_sender_address(email_address: str | None) -> bool:
    domain = _sender_domain(email_address)
    return domain in _GMAIL_DOMAINS if domain else False


def _max_attempts() -> int:
    try:
        return max(1, int(os.environ.get("EMAIL_MAX_ATTEMPTS") or "5"))
    except ValueError:
        return 5


def _stale_sending_seconds() -> int:
    try:
        return max(30, int(os.environ.get("EMAIL_SENDING_STALE_SEC") or "300"))
    except ValueError:
        return 300


def _set_error(row: OutboundEmailMessage, message: str) -> None:
    row.last_error = message
    row.error = message


def deliver_one_outbound_email(db: Session, row: OutboundEmailMessage) -> dict[str, Any]:
    """
    Claim PENDING (or stale SENDING) → SENDING → provider.send → SENT | PENDING/FAILED.

    Never marks SENT without a successful provider.send() call.
    If already SENT with provider_message_id, no-op (idempotent worker retry).
    """
    status = normalize_outbound_status(row.status)
    if status == EMAIL_SENT and row.provider_message_id:
        return {"id": int(row.id), "status": EMAIL_SENT, "skipped": "already_sent"}

    if status == EMAIL_FAILED:
        return {"id": int(row.id), "status": EMAIL_FAILED, "skipped": "already_failed"}

    now = datetime.utcnow()
    if status == EMAIL_SENDING:
        last = row.last_attempt_at
        if last is not None and (now - last) < timedelta(seconds=_stale_sending_seconds()):
            return {"id": int(row.id), "status": EMAIL_SENDING, "skipped": "in_flight"}
        # Stale SENDING: reclaim carefully. SMTP may have already accepted —
        # limitation documented; we still attempt once more only after stale window.
        logger.warning(
            "email reclaiming stale SENDING id=%s idempotency=%s",
            row.id,
            row.idempotency_key,
        )

    row.status = EMAIL_SENDING
    row.attempt_count = int(row.attempt_count or 0) + 1
    row.last_attempt_at = now
    db.add(row)
    db.flush()

    provider = get_email_provider()
    if not provider.is_configured():
        _set_error(row, "configuration_error: Email provider is not configured")
        row.status = EMAIL_FAILED
        row.failed_at = now
        row.provider = getattr(provider, "name", "unconfigured")
        db.add(row)
        db.flush()
        return {
            "id": int(row.id),
            "status": EMAIL_FAILED,
            "error_code": "configuration_error",
        }

    try:
        from_addr: str | None = None
        if row.mail_account_id:
            from ...models.mail import MailAccount

            mail_account = db.query(MailAccount).filter(MailAccount.id == int(row.mail_account_id)).first()
            if mail_account is not None:
                from_addr = mail_account.email_address

        if row.mail_account_id and from_addr and is_gmail_sender_address(from_addr):
            raise EmailProviderError(
                _GMAIL_OAUTH_REQUIRED_MSG,
                code="gmail_oauth_required",
                transient=False,
            )

        result = provider.send(
            EmailSendRequest(
                to_address=str(row.recipient_email),
                subject=str(row.subject or ""),
                body_text=str(row.body or ""),
                idempotency_key=str(row.idempotency_key),
                from_address=from_addr,
                message_id=str(row.message_id_header) if row.message_id_header else None,
                in_reply_to=str(row.in_reply_to) if row.in_reply_to else None,
                references=str(row.references_header) if row.references_header else None,
            )
        )
    except EmailProviderError as exc:
        _set_error(row, f"{exc.code}: {exc}")
        row.provider = getattr(provider, "name", None)
        if (not exc.transient) or int(row.attempt_count or 0) >= _max_attempts():
            row.status = EMAIL_FAILED
            row.failed_at = now
            db.add(row)
            db.flush()
            return {
                "id": int(row.id),
                "status": EMAIL_FAILED,
                "error_code": exc.code,
                "attempt_count": int(row.attempt_count or 0),
            }
        # Transient → back to PENDING for retry
        row.status = EMAIL_PENDING
        db.add(row)
        db.flush()
        return {
            "id": int(row.id),
            "status": EMAIL_PENDING,
            "error_code": exc.code,
            "retry": True,
            "attempt_count": int(row.attempt_count or 0),
        }
    except Exception as exc:
        logger.exception("email provider crashed id=%s", row.id)
        _set_error(row, f"provider_crash: {exc}")
        row.provider = getattr(provider, "name", None)
        if int(row.attempt_count or 0) >= _max_attempts():
            row.status = EMAIL_FAILED
            row.failed_at = now
        else:
            row.status = EMAIL_PENDING
        db.add(row)
        db.flush()
        return {"id": int(row.id), "status": row.status, "error_code": "provider_crash"}

    # Success — only now SENT
    row.status = EMAIL_SENT
    row.sent_at = now
    row.provider = result.provider
    row.provider_message_id = result.provider_message_id
    row.last_error = None
    row.error = None
    row.failed_at = None
    db.add(row)
    db.flush()
    return {
        "id": int(row.id),
        "status": EMAIL_SENT,
        "provider_message_id": result.provider_message_id,
        "attempt_count": int(row.attempt_count or 0),
    }


def process_pending_outbound_emails(db: Session, *, limit: int = 20) -> dict[str, Any]:
    """Worker tick: deliver up to ``limit`` PENDING / stale SENDING messages."""
    stale_before = datetime.utcnow() - timedelta(seconds=_stale_sending_seconds())
    rows = (
        db.query(OutboundEmailMessage)
        .filter(
            (OutboundEmailMessage.status.in_((EMAIL_PENDING, "QUEUED")))
            | (
                (OutboundEmailMessage.status == EMAIL_SENDING)
                & (OutboundEmailMessage.last_attempt_at.isnot(None))
                & (OutboundEmailMessage.last_attempt_at < stale_before)
            )
        )
        .order_by(OutboundEmailMessage.id.asc())
        .limit(int(limit))
        .all()
    )
    results = []
    for row in rows:
        try:
            results.append(deliver_one_outbound_email(db, row))
        except Exception:
            logger.exception("deliver_one failed id=%s", getattr(row, "id", None))
            try:
                db.rollback()
            except Exception:
                pass
    return {"processed": len(results), "results": results}
