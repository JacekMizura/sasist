"""Idempotent outbound email enqueue — PENDING only (no fake SENT)."""

from __future__ import annotations

import json
import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ...models.messaging import (
    EMAIL_PENDING,
    MessageTemplate,
    OutboundEmailMessage,
)


_VAR_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")


def render_template_string(template: str, context: dict[str, Any]) -> str:
    def repl(m: re.Match[str]) -> str:
        key = m.group(1)
        val = context.get(key)
        return "" if val is None else str(val)

    return _VAR_RE.sub(repl, template or "")


def automation_email_idempotency_key(execution_id: int, effect_id: int) -> str:
    return f"ae:{int(execution_id)}:{int(effect_id)}"


def normalize_outbound_status(raw: object) -> str:
    s = str(raw or "").strip().upper()
    if s in ("QUEUED", ""):
        return EMAIL_PENDING
    return s


def enqueue_or_get_outbound_email(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: Optional[int],
    entity_type: str,
    entity_id: int,
    template: MessageTemplate,
    recipient_email: str,
    recipient_type: str,
    context: dict[str, Any],
    idempotency_key: str,
    automation_execution_id: Optional[int],
    automation_effect_id: Optional[int],
) -> tuple[OutboundEmailMessage, bool]:
    """
    Create or return existing outbound message for idempotency_key.
    Always leaves new rows as PENDING — delivery worker + provider mark SENT.
    """
    existing = (
        db.query(OutboundEmailMessage)
        .filter(OutboundEmailMessage.idempotency_key == str(idempotency_key))
        .first()
    )
    if existing is not None:
        if str(existing.status or "").upper() == "QUEUED":
            existing.status = EMAIL_PENDING
            db.add(existing)
            db.flush()
        return existing, False

    subject = render_template_string(template.subject_template, context)
    body = render_template_string(template.body_template, context)
    row = OutboundEmailMessage(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        entity_type=str(entity_type).upper(),
        entity_id=int(entity_id),
        template_id=int(template.id),
        recipient_email=str(recipient_email).strip(),
        recipient_type=str(recipient_type or "CUSTOMER").upper(),
        subject=subject,
        body=body,
        context_json=json.dumps(context, ensure_ascii=False),
        status=EMAIL_PENDING,
        provider=None,
        provider_message_id=None,
        attempt_count=0,
        idempotency_key=str(idempotency_key),
        automation_execution_id=int(automation_execution_id) if automation_execution_id else None,
        automation_effect_id=int(automation_effect_id) if automation_effect_id else None,
        created_at=datetime.utcnow(),
    )
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        existing = (
            db.query(OutboundEmailMessage)
            .filter(OutboundEmailMessage.idempotency_key == str(idempotency_key))
            .first()
        )
        if existing is None:
            raise
        return existing, False

    return row, True
