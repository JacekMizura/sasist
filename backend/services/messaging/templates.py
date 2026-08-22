"""Message template store + CRUD."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional, Sequence

from sqlalchemy.orm import Session

from ...models.messaging import MessageTemplate
from .template_channels import (
    CHANNEL_EMAIL,
    channel_label,
    normalize_channel,
    parse_attachments_json,
    serialize_attachments,
)
from .template_scopes import (
    ALL_CONTEXTS,
    coerce_write_contexts,
    format_contexts_label,
    normalize_supported_contexts,
    serialize_supported_contexts,
    template_supports_entity,
)

_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]{1,62}$")


def template_to_dict(row: MessageTemplate) -> dict[str, Any]:
    contexts = normalize_supported_contexts(row.entity_scope)
    channel = normalize_channel(getattr(row, "channel", None) or CHANNEL_EMAIL)
    attachments = parse_attachments_json(getattr(row, "attachments_json", None) or "[]")
    return {
        "id": int(row.id),
        "tenant_id": int(row.tenant_id),
        "warehouse_id": int(row.warehouse_id) if row.warehouse_id is not None else None,
        "code": row.code,
        "name": row.name,
        "channel": channel,
        "channel_label": channel_label(channel),
        "supported_contexts": contexts,
        "supported_contexts_label": format_contexts_label(contexts),
        "subject_template": row.subject_template if channel == CHANNEL_EMAIL else "",
        "body_template": row.body_template,
        "attachments": attachments if channel == CHANNEL_EMAIL else [],
        "is_active": bool(row.is_active),
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "updated_at": row.updated_at.isoformat() if row.updated_at else None,
    }


def list_email_templates(
    db: Session,
    *,
    tenant_id: int,
    entity_type: Optional[str] = None,
    active_only: bool = True,
    warehouse_id: Optional[int] = None,
    channel: Optional[str] = CHANNEL_EMAIL,
) -> list[MessageTemplate]:
    """
    List templates. Default channel=email for Poczta/Automation pickers.
    Pass channel=None to list all channels (admin module).
    """
    q = db.query(MessageTemplate).filter(MessageTemplate.tenant_id == int(tenant_id))
    if channel is not None:
        q = q.filter(MessageTemplate.channel == normalize_channel(channel))
    if active_only:
        q = q.filter(MessageTemplate.is_active.is_(True))
    if warehouse_id is not None:
        q = q.filter(
            (MessageTemplate.warehouse_id.is_(None)) | (MessageTemplate.warehouse_id == int(warehouse_id))
        )
    rows = q.order_by(MessageTemplate.name.asc(), MessageTemplate.id.asc()).all()
    if entity_type:
        rows = [r for r in rows if template_supports_entity(r.entity_scope, entity_type)]
    return rows


def get_template_for_tenant(
    db: Session, *, tenant_id: int, template_id: int
) -> Optional[MessageTemplate]:
    return (
        db.query(MessageTemplate)
        .filter(
            MessageTemplate.id == int(template_id),
            MessageTemplate.tenant_id == int(tenant_id),
        )
        .first()
    )


def get_active_email_template(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
    entity_type: Optional[str] = None,
) -> tuple[Optional[MessageTemplate], Optional[str]]:
    row = db.query(MessageTemplate).filter(MessageTemplate.id == int(template_id)).first()
    if row is None:
        return None, "template_not_found"
    if int(row.tenant_id) != int(tenant_id):
        return None, "template_wrong_tenant"
    if normalize_channel(row.channel) != CHANNEL_EMAIL:
        return None, "template_wrong_channel"
    if not bool(row.is_active):
        return None, "template_inactive"
    if entity_type and not template_supports_entity(row.entity_scope, entity_type):
        return None, "template_entity_mismatch"
    return row, None


def _slug_code(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", (name or "template").strip().lower()).strip("_")
    return (base or "template")[:48]


def create_email_template(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    subject_template: str,
    body_template: str,
    supported_contexts: Optional[Sequence[str]] = None,
    entity_scope: Optional[str] = None,
    channel: str = CHANNEL_EMAIL,
    attachments: Optional[Sequence[dict[str, Any]]] = None,
    code: Optional[str] = None,
    warehouse_id: Optional[int] = None,
    is_active: bool = True,
) -> MessageTemplate:
    # Editor no longer exposes modules — default all contexts unless explicitly set.
    contexts = (
        coerce_write_contexts(supported_contexts=supported_contexts, entity_scope=entity_scope)
        if supported_contexts is not None or entity_scope is not None
        else list(ALL_CONTEXTS)
    )
    stored = serialize_supported_contexts(contexts)
    ch = normalize_channel(channel)
    nm = (name or "").strip() or "Bez nazwy"
    cd = (code or "").strip().lower() or _slug_code(nm)
    if not _CODE_RE.match(cd):
        raise ValueError("invalid template code")
    subject = subject_template or "" if ch == CHANNEL_EMAIL else ""
    atts = serialize_attachments(attachments if ch == CHANNEL_EMAIL else [])
    now = datetime.utcnow()
    row = MessageTemplate(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        code=cd,
        name=nm,
        channel=ch,
        entity_scope=stored,
        subject_template=subject,
        body_template=body_template or "",
        attachments_json=atts,
        is_active=bool(is_active),
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    db.flush()
    return row


def update_email_template(
    db: Session,
    row: MessageTemplate,
    *,
    name: Optional[str] = None,
    subject_template: Optional[str] = None,
    body_template: Optional[str] = None,
    supported_contexts: Optional[Sequence[str]] = None,
    entity_scope: Optional[str] = None,
    channel: Optional[str] = None,
    attachments: Optional[Sequence[dict[str, Any]]] = None,
    is_active: Optional[bool] = None,
) -> MessageTemplate:
    if name is not None:
        row.name = name.strip() or row.name
    if channel is not None:
        row.channel = normalize_channel(channel)
    ch = normalize_channel(row.channel)
    if subject_template is not None:
        row.subject_template = subject_template if ch == CHANNEL_EMAIL else ""
    elif ch != CHANNEL_EMAIL:
        row.subject_template = ""
    if body_template is not None:
        row.body_template = body_template
    if attachments is not None:
        row.attachments_json = serialize_attachments(attachments if ch == CHANNEL_EMAIL else [])
    elif ch != CHANNEL_EMAIL:
        row.attachments_json = "[]"
    if supported_contexts is not None or entity_scope is not None:
        contexts = coerce_write_contexts(
            supported_contexts=supported_contexts,
            entity_scope=entity_scope if supported_contexts is None else None,
        )
        row.entity_scope = serialize_supported_contexts(contexts)
    if is_active is not None:
        row.is_active = bool(is_active)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def archive_email_template(db: Session, row: MessageTemplate) -> MessageTemplate:
    """Soft-disable — never hard-delete (history / outbox FK)."""
    return update_email_template(db, row, is_active=False)


def migrate_legacy_entity_scopes(db: Session) -> int:
    """Rewrite legacy ALL|single values to canonical CSV. Idempotent."""
    changed = 0
    rows = db.query(MessageTemplate).all()
    for row in rows:
        raw = row.entity_scope
        canonical = serialize_supported_contexts(normalize_supported_contexts(raw))
        if str(raw or "") != canonical:
            row.entity_scope = canonical
            db.add(row)
            changed += 1
    if changed:
        db.flush()
    return changed
