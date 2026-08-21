"""API: message templates (email) — list/detail/CRUD for automation + settings UI."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.messaging.templates import (
    archive_email_template,
    create_email_template,
    get_template_for_tenant,
    list_email_templates,
    template_to_dict,
    update_email_template,
)

# Mounted in main.py under `/api/admin/message-templates` and legacy `/api/message-templates`.
router = APIRouter(tags=["Message templates"])


class MessageTemplateCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str
    subject_template: str = ""
    body_template: str = ""
    entity_scope: str = "ALL"
    code: Optional[str] = None
    warehouse_id: Optional[int] = None
    is_active: bool = True


class MessageTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject_template: Optional[str] = None
    body_template: Optional[str] = None
    entity_scope: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/")
def list_message_templates(
    tenant_id: int = Query(..., ge=1),
    entity_type: Optional[str] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    active_only: bool = Query(True),
    db: Session = Depends(get_db),
):
    rows = list_email_templates(
        db,
        tenant_id=tenant_id,
        entity_type=entity_type,
        active_only=active_only,
        warehouse_id=warehouse_id,
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
