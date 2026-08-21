"""send_email effect — enqueue via messaging outbox SSOT."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ....models.automation import StatusTransitionEvent
from ...messaging.context import build_entity_email_context
from ...messaging.email_outbox import automation_email_idempotency_key, enqueue_or_get_outbound_email
from ...messaging.recipients import resolve_customer_email, resolve_internal_user_email
from ...messaging.templates import get_active_email_template
from ..constants import ENTITY_TYPES
from . import EffectResult


def _template_id(config: dict[str, Any]) -> int:
    raw = config.get("template_id", config.get("templateId"))
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


def _recipient_type(config: dict[str, Any]) -> str:
    raw = str(config.get("recipient_type") or config.get("recipient") or "CUSTOMER").strip().upper()
    return raw or "CUSTOMER"


def _user_id(config: dict[str, Any]) -> int:
    raw = config.get("user_id", config.get("userId"))
    try:
        return int(raw) if raw is not None else 0
    except (TypeError, ValueError):
        return 0


def execute_send_email(
    db: Session,
    *,
    config: dict[str, Any],
    event: StatusTransitionEvent,
    actor_user_id: Optional[int],
    execution_id: Optional[int] = None,
    effect_id: Optional[int] = None,
) -> EffectResult:
    del actor_user_id
    entity_type = str(event.entity_type or "").upper()
    if entity_type not in ENTITY_TYPES:
        return EffectResult(ok=False, message=f"send_email unsupported entity_type={entity_type}")

    recipient_type = _recipient_type(config)
    if recipient_type not in ("CUSTOMER", "INTERNAL"):
        return EffectResult(
            ok=False,
            message="send_email supports recipient_type=CUSTOMER|INTERNAL only",
            data={"error_code": "unsupported_recipient_type", "recipient_type": recipient_type},
        )

    tid = _template_id(config)
    if tid <= 0:
        return EffectResult(
            ok=False,
            message="send_email requires template_id",
            data={"error_code": "invalid_effect"},
        )

    template, terr = get_active_email_template(
        db,
        tenant_id=int(event.tenant_id),
        template_id=tid,
        entity_type=entity_type,
    )
    if template is None:
        return EffectResult(
            ok=False,
            message=terr or "template_not_found",
            data={"error_code": terr or "template_not_found", "template_id": tid},
        )

    if recipient_type == "CUSTOMER":
        recipient = resolve_customer_email(
            db,
            tenant_id=int(event.tenant_id),
            entity_type=entity_type,
            entity_id=int(event.entity_id),
        )
    else:
        recipient = resolve_internal_user_email(db, user_id=_user_id(config))

    if not recipient.ok or not recipient.email:
        code = recipient.error_code or "recipient_email_missing"
        return EffectResult(
            ok=False,
            message=f"{code}: {recipient.message or 'missing email'}",
            data={"error_code": code},
        )

    if execution_id is None or effect_id is None:
        return EffectResult(
            ok=False,
            message="send_email requires execution_id and effect_id for idempotency",
            data={"error_code": "missing_idempotency_context"},
        )

    context = build_entity_email_context(
        db,
        tenant_id=int(event.tenant_id),
        entity_type=entity_type,
        entity_id=int(event.entity_id),
    )
    key = automation_email_idempotency_key(int(execution_id), int(effect_id))
    msg, created = enqueue_or_get_outbound_email(
        db,
        tenant_id=int(event.tenant_id),
        warehouse_id=int(event.warehouse_id) if getattr(event, "warehouse_id", None) else None,
        entity_type=entity_type,
        entity_id=int(event.entity_id),
        template=template,
        recipient_email=recipient.email,
        recipient_type=recipient_type,
        context=context,
        idempotency_key=key,
        automation_execution_id=int(execution_id),
        automation_effect_id=int(effect_id),
    )
    return EffectResult(
        ok=True,
        message="email_enqueued" if created else "email_idempotent_reuse",
        data={
            "message_id": int(msg.id),
            "recipient": msg.recipient_email,
            "recipient_type": recipient_type,
            "template_id": int(template.id),
            "idempotency_key": key,
            "created": created,
            "delivery_status": str(msg.status),
            **({"user_id": _user_id(config)} if recipient_type == "INTERNAL" else {}),
        },
    )
