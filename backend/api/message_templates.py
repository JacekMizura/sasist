"""API: message templates (email/sms/note) — list/detail/CRUD for automation + settings UI."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.order_custom_field import OrderCustomField
from ..services.messaging.context import build_entity_email_context
from ..services.messaging.template_channels import ATTACHMENT_FIELD_TYPES, CHANNEL_EMAIL, normalize_channel
from ..services.messaging.template_vars.registry import list_variable_groups
from ..services.messaging.template_vars.render import log_render_gaps, render_template
from ..services.messaging.templates import (
    archive_email_template,
    create_email_template,
    get_template_for_tenant,
    list_email_templates,
    template_to_dict,
    update_email_template,
)
from ..services.order_custom_field_service import serialize_field_definition

# Mounted in main.py under `/api/admin/message-templates` and legacy `/api/message-templates`.
# IMPORTANT: static paths (/variables, /preview, /attachment-sources) must be registered before /{template_id}.
router = APIRouter(tags=["Message templates"])


class MessageTemplateCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str
    subject_template: str = ""
    body_template: str = ""
    channel: str = CHANNEL_EMAIL
    attachments: Optional[list[dict[str, Any]]] = None
    supported_contexts: Optional[list[str]] = None
    #: Deprecated — mapped to supported_contexts when supported_contexts omitted.
    entity_scope: Optional[str] = None
    code: Optional[str] = None
    warehouse_id: Optional[int] = None
    is_active: bool = True


class MessageTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    channel: Optional[str] = None
    attachments: Optional[list[dict[str, Any]]] = None
    supported_contexts: Optional[list[str]] = None
    entity_scope: Optional[str] = None
    is_active: Optional[bool] = None


class MessageTemplatePreviewBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    subject_template: str = ""
    body_template: str = ""
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None


@router.get("/variables")
def get_message_template_variables(
    entity_type: Optional[str] = Query(None),
):
    """Canonical variable catalog for the message-template editor."""
    return {"groups": list_variable_groups(entity_type=entity_type)}


@router.get("/attachment-sources")
def get_message_template_attachment_sources(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    """
    Canonical attachment sources for EMAIL templates.
    Currently: active order custom fields of file/document types.
    """
    rows = (
        db.query(OrderCustomField)
        .filter(
            OrderCustomField.tenant_id == int(tenant_id),
            OrderCustomField.warehouse_id == int(warehouse_id),
            OrderCustomField.is_active.is_(True),
            OrderCustomField.type.in_(tuple(ATTACHMENT_FIELD_TYPES)),
        )
        .order_by(OrderCustomField.sort_order.asc(), OrderCustomField.name.asc())
        .all()
    )
    items = []
    for r in rows:
        d = serialize_field_definition(r)
        items.append(
            {
                "source": "order_custom_field",
                "field_id": int(d.id),
                "field_slug": d.slug,
                "field_name": d.name,
                "field_type": d.type,
                "label": d.name,
            }
        )
    return {"items": items}


@router.post("/preview")
def preview_message_template(body: MessageTemplatePreviewBody, db: Session = Depends(get_db)):
    """
    Render subject/body without persisting.

    - Without live entity: structural preview (placeholders kept; not reported as missing).
    - With entity_type+entity_id: live resolve; true missing values reported.
    Unknown tokens always reported.
    """
    used_live = bool(body.entity_type and body.entity_id)
    ctx: dict[str, Any] = {"tenant_id": int(body.tenant_id)}
    if used_live:
        ctx = build_entity_email_context(
            db,
            tenant_id=int(body.tenant_id),
            entity_type=str(body.entity_type),
            entity_id=int(body.entity_id),
        )
    rendered = render_template(
        subject_template=body.subject_template,
        body_template=body.body_template,
        context=ctx,
        body_is_html=True,
        keep_unresolved=not used_live,
    )
    log_render_gaps(
        source="message_template_preview",
        missing_variables=rendered.missing_variables,
        unknown_variables=rendered.unknown_variables,
    )
    return {
        "subject": rendered.subject,
        "body_html": rendered.body,
        "missing_variables": rendered.missing_variables,
        "unknown_variables": rendered.unknown_variables,
        "context_keys": sorted(str(k) for k in ctx.keys()),
        "used_live_context": used_live,
        "structural_preview": not used_live,
    }


@router.get("/")
def list_message_templates(
    tenant_id: int = Query(..., ge=1),
    entity_type: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    active_only: bool = Query(True),
    channel: Optional[str] = Query(
        "email",
        description="email|sms|note|all. Default email for pickers; pass all for admin list.",
    ),
    db: Session = Depends(get_db),
):
    ch: Optional[str]
    raw = (channel or "email").strip().lower()
    if raw in ("", "all", "*"):
        ch = None
    else:
        try:
            ch = normalize_channel(raw)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    rows = list_email_templates(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        active_only=active_only,
        warehouse_id=warehouse_id,
        channel=ch,
    )
    return [template_to_dict(r) for r in rows]


@router.get("/{template_id}")
def get_message_template(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_template_for_tenant(db, tenant_id=tenant_id, template_id=template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="template_not_found")
    return template_to_dict(row)


@router.post("/")
def create_message_template(body: MessageTemplateCreate, db: Session = Depends(get_db)):
    try:
        row = create_email_template(
            db,
            tenant_id=body.tenant_id,
            name=body.name,
            subject_template=body.subject_template,
            body_template=body.body_template,
            channel=body.channel,
            attachments=body.attachments,
            supported_contexts=body.supported_contexts,
            entity_scope=body.entity_scope,
            code=body.code,
            warehouse_id=body.warehouse_id,
            is_active=body.is_active,
        )
        db.commit()
        db.refresh(row)
        return template_to_dict(row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="template_code_conflict") from exc


@router.patch("/{template_id}")
def patch_message_template(
    template_id: int,
    body: MessageTemplateUpdate,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_template_for_tenant(db, tenant_id=tenant_id, template_id=template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="template_not_found")
    try:
        update_email_template(
            db,
            row,
            name=body.name,
            subject_template=body.subject_template,
            body_template=body.body_template,
            channel=body.channel,
            attachments=body.attachments,
            supported_contexts=body.supported_contexts,
            entity_scope=body.entity_scope,
            is_active=body.is_active,
        )
        db.commit()
        db.refresh(row)
        return template_to_dict(row)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{template_id}/archive")
def archive_message_template(
    template_id: int,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    row = get_template_for_tenant(db, tenant_id=tenant_id, template_id=template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="template_not_found")
    archive_email_template(db, row)
    db.commit()
    db.refresh(row)
    return template_to_dict(row)
