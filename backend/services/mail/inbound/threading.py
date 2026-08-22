"""RFC threading — Message-ID / In-Reply-To / References only."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ....models.mail import MailConversation, MailMessage
from .message_parser import extract_reference_ids, normalize_message_id


def find_conversation_by_rfc_headers(
    db: Session,
    *,
    tenant_id: int,
    in_reply_to: str | None,
    references_header: str | None,
) -> MailConversation | None:
    ref_ids = extract_reference_ids(references_header, in_reply_to)
    for ref in ref_ids:
        conv = _conversation_for_message_id(db, tenant_id=tenant_id, message_id=ref)
        if conv is not None:
            return conv
    return None


def _conversation_for_message_id(
    db: Session,
    *,
    tenant_id: int,
    message_id: str,
) -> MailConversation | None:
    norm = normalize_message_id(message_id)
    if not norm:
        return None
    row = (
        db.query(MailMessage)
        .filter(
            MailMessage.tenant_id == int(tenant_id),
            MailMessage.message_id_header == norm,
        )
        .order_by(MailMessage.id.desc())
        .first()
    )
    if row is None:
        return None
    return (
        db.query(MailConversation)
        .filter(
            MailConversation.id == int(row.conversation_id),
            MailConversation.tenant_id == int(tenant_id),
        )
        .first()
    )
