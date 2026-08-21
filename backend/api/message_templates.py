"""API: message templates (email) — list for automation editors."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..database import get_db
from ..services.messaging.templates import list_email_templates, template_to_dict

# Mounted in main.py under `/api/admin/message-templates` and legacy `/api/message-templates`.
router = APIRouter(tags=["Message templates"])


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
