"""Persist inbound messages — dedupe, thread, conversation create."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ....models.mail import (
    CONV_STATUS_OPEN,
    MSG_DIRECTION_INBOUND,
    MailAccount,
    MailConversation,
    MailMessage,
)
from .customer_match import find_customer_id_by_email
from .imap_connector import FetchedImapMessage, ImapConnector
from .message_parser import addresses_to_json, normalize_message_id, parse_inbound_email
from .threading import find_conversation_by_rfc_headers

logger = logging.getLogger(__name__)


def _message_exists(
    db: Session,
    *,
    account_id: int,
    imap_uid: int | None,
    message_id_header: str | None,
) -> bool:
    if imap_uid is not None:
        hit = (
            db.query(MailMessage.id)
            .filter(MailMessage.account_id == int(account_id), MailMessage.imap_uid == int(imap_uid))
            .first()
        )
        if hit is not None:
            return True
    if message_id_header:
        hit = (
            db.query(MailMessage.id)
            .filter(
                MailMessage.account_id == int(account_id),
                MailMessage.message_id_header == message_id_header,
            )
            .first()
        )
        if hit is not None:
            return True
    return False


def _create_conversation(
    db: Session,
    *,
    tenant_id: int,
    subject: str,
    customer_id: int | None,
    received_at: datetime,
) -> MailConversation:
    conv = MailConversation(
        tenant_id=int(tenant_id),
        status=CONV_STATUS_OPEN,
        customer_id=customer_id,
        subject=(subject or "").strip()[:998] or "(bez tematu)",
        last_message_at=received_at,
        last_inbound_at=received_at,
        unread_count=1,
        created_at=datetime.utcnow(),
    )
    db.add(conv)
    db.flush()
    return conv


def _touch_conversation(conv: MailConversation, *, received_at: datetime) -> None:
    conv.last_message_at = received_at
    conv.last_inbound_at = received_at
    conv.unread_count = int(conv.unread_count or 0) + 1


def ingest_inbound_message(
    db: Session,
    *,
    account: MailAccount,
    parsed,
    imap_uid: int | None,
) -> tuple[MailMessage | None, bool]:
    """
    Returns (message, created). None + False when duplicate ignored.
    """
    message_id = normalize_message_id(parsed.message_id_header)
    if _message_exists(db, account_id=account.id, imap_uid=imap_uid, message_id_header=message_id):
        return None, False

    conv = find_conversation_by_rfc_headers(
        db,
        tenant_id=int(account.tenant_id),
        in_reply_to=parsed.in_reply_to,
        references_header=parsed.references_header,
    )
    customer_id = find_customer_id_by_email(db, tenant_id=int(account.tenant_id), email=parsed.sender_email)
    if conv is None:
        conv = _create_conversation(
            db,
            tenant_id=int(account.tenant_id),
            subject=parsed.subject,
            customer_id=customer_id,
            received_at=parsed.received_at,
        )
    else:
        _touch_conversation(conv, received_at=parsed.received_at)
        if conv.customer_id is None and customer_id is not None:
            conv.customer_id = customer_id

    row = MailMessage(
        tenant_id=int(account.tenant_id),
        conversation_id=int(conv.id),
        account_id=int(account.id),
        direction=MSG_DIRECTION_INBOUND,
        sender_email=parsed.sender_email,
        to_json=addresses_to_json(parsed.to_addresses),
        cc_json=addresses_to_json(parsed.cc_addresses),
        subject=(parsed.subject or "")[:998],
        text_body=parsed.text_body or "",
        html_body_raw=parsed.html_body_raw,
        message_id_header=message_id,
        in_reply_to=parsed.in_reply_to,
        references_header=parsed.references_header,
        imap_uid=int(imap_uid) if imap_uid is not None else None,
        received_at=parsed.received_at,
        created_at=datetime.utcnow(),
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError:
        db.expire_all()
        return None, False
    return row, True


def sync_account_inbound(
    db: Session,
    account: MailAccount,
    connector: ImapConnector,
    *,
    batch_size: int = 50,
) -> dict[str, Any]:
    if not account.is_active or account.is_send_only:
        return {"skipped": True, "reason": "inactive_or_send_only"}

    fetched = connector.fetch_since_uid(int(account.last_sync_uid or 0), batch_size)
    created = 0
    duplicates = 0
    max_uid = int(account.last_sync_uid or 0)

    for item in fetched:
        max_uid = max(max_uid, int(item.uid))
        try:
            parsed = parse_inbound_email(item.raw_bytes)
            msg, was_created = ingest_inbound_message(db, account=account, parsed=parsed, imap_uid=item.uid)
            if was_created:
                created += 1
            else:
                duplicates += 1
        except Exception:
            logger.exception("mail_sync parse failed account_id=%s uid=%s", account.id, item.uid)

    account.last_sync_uid = max_uid
    account.last_sync_at = datetime.utcnow()
    account.last_sync_error = None
    db.add(account)
    db.flush()

    return {
        "account_id": account.id,
        "fetched": len(fetched),
        "created": created,
        "duplicates": duplicates,
        "last_sync_uid": max_uid,
    }


def sync_account_inbound_safe(
    db: Session,
    account: MailAccount,
    connector: ImapConnector,
    *,
    batch_size: int = 50,
) -> dict[str, Any]:
    try:
        result = sync_account_inbound(db, account, connector, batch_size=batch_size)
        db.commit()
        return result
    except Exception as exc:
        db.rollback()
        logger.exception("mail_sync account failed account_id=%s", account.id)
        account.last_sync_error = str(exc)[:500]
        account.updated_at = datetime.utcnow()
        db.add(account)
        db.commit()
        return {"account_id": account.id, "error": str(exc)[:500]}
