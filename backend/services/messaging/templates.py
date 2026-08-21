"""Message template store."""

from __future__ import annotations

from typing import Any, Optional

from sqlalchemy.orm import Session

from ...models.messaging import MessageTemplate


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


def get_active_email_template(
    db: Session,
    *,
    tenant_id: int,
    template_id: int,
    entity_type: Optional[str] = None,
) -> tuple[Optional[MessageTemplate], Optional[str]]:
    """
    Returns (template, error_code).
    error_code: template_not_found | template_wrong_tenant | template_inactive |
                template_wrong_channel | template_entity_mismatch
    """
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
