"""Message template store + CRUD."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.messaging import MessageTemplate

_CODE_RE = re.compile(r"^[a-z0-9][a-z0-9_\-]{1,62}$")
_SCOPES = frozenset({"ALL", "ORDER", "RETURN", "COMPLAINT"})


def template_to_dict(row: MessageTemplate) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "tenant_id": int(row.tenant_id),
        "warehouse_id": int(row.warehouse_id) if row.warehouse_id is not None else None,
        "code": row.code,
        "name": row.name,
        "channel": row.channel,
        "entity_scope": row.entity_scope,
        "subject_template": row.subject_template,
        "body_template": row.body_template,
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
) -> list[MessageTemplate]:
    q = db.query(MessageTemplate).filter(
        MessageTemplate.tenant_id == int(tenant_id),
        MessageTemplate.channel == "email",
    )
    if active_only:
        q = q.filter(MessageTemplate.is_active.is_(True))
    if warehouse_id is not None:
        q = q.filter(
            (MessageTemplate.warehouse_id.is_(None)) | (MessageTemplate.warehouse_id == int(warehouse_id))
        )
    rows = q.order_by(MessageTemplate.name.asc(), MessageTemplate.id.asc()).all()
    if entity_type:
        et = str(entity_type).upper()
        rows = [r for r in rows if str(r.entity_scope or "ALL").upper() in ("ALL", et)]
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
    if str(row.channel or "").lower() != "email":
        return None, "template_wrong_channel"
    if not bool(row.is_active):
        return None, "template_inactive"
    if entity_type:
        scope = str(row.entity_scope or "ALL").upper()
        et = str(entity_type).upper()
        if scope not in ("ALL", et):
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
    entity_scope: str = "ALL",
    code: Optional[str] = None,
    warehouse_id: Optional[int] = None,
    is_active: bool = True,
) -> MessageTemplate:
    scope = str(entity_scope or "ALL").strip().upper()
    if scope not in _SCOPES:
        raise ValueError(f"invalid entity_scope={entity_scope}")
    nm = (name or "").strip() or "Bez nazwy"
    cd = (code or "").strip().lower() or _slug_code(nm)
    if not _CODE_RE.match(cd):
        raise ValueError("invalid template code")
    now = datetime.utcnow()
    row = MessageTemplate(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id) if warehouse_id is not None else None,
        code=cd,
        name=nm,
        channel="email",
        entity_scope=scope,
        subject_template=subject_template or "",
        body_template=body_template or "",
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
    entity_scope: Optional[str] = None,
    is_active: Optional[bool] = None,
) -> MessageTemplate:
    if name is not None:
        row.name = name.strip() or row.name
    if subject_template is not None:
        row.subject_template = subject_template
    if body_template is not None:
        row.body_template = body_template
    if entity_scope is not None:
        scope = str(entity_scope).strip().upper()
        if scope not in _SCOPES:
            raise ValueError(f"invalid entity_scope={entity_scope}")
        row.entity_scope = scope
    if is_active is not None:
        row.is_active = bool(is_active)
    row.updated_at = datetime.utcnow()
    db.add(row)
    db.flush()
    return row


def archive_email_template(db: Session, row: MessageTemplate) -> MessageTemplate:
    """Soft-disable — never hard-delete (history / outbox FK)."""
    return update_email_template(db, row, is_active=False)
