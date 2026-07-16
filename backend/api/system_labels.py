"""System labels API — dictionary + resolved map for frontend cache."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user, require_super_role
from ..database import get_db
from ..models.app_user import AppUser
from ..services.system_label_service import (
    list_labels,
    resolve_label_value,
    seed_system_labels,
    update_custom_value,
)

router = APIRouter(prefix="/system/labels", tags=["System Labels"])


class SystemLabelRead(BaseModel):
    id: int
    key: str
    default_value: str
    custom_value: str | None
    resolved_value: str
    tenant_id: int | None
    description: str | None
    category: str
    created_at: str | None = None
    updated_at: str | None = None

    model_config = {"from_attributes": True}


class SystemLabelUpdateBody(BaseModel):
    custom_value: str | None = Field(None, description="Empty / null clears override")


class ResolvedLabelsResponse(BaseModel):
    labels: dict[str, str]
    defaults: dict[str, str] = Field(default_factory=dict)
    version: str


def _iso(dt) -> str | None:
    if dt is None:
        return None
    try:
        return dt.isoformat()
    except Exception:
        return str(dt)


def _to_read(row) -> SystemLabelRead:
    return SystemLabelRead(
        id=row.id,
        key=row.key,
        default_value=row.default_value or "",
        custom_value=row.custom_value,
        resolved_value=resolve_label_value(row),
        tenant_id=row.tenant_id,
        description=row.description,
        category=row.category or "general",
        created_at=_iso(getattr(row, "created_at", None)),
        updated_at=_iso(getattr(row, "updated_at", None)),
    )


@router.get("/resolved", response_model=ResolvedLabelsResponse)
def get_resolved_labels(
    db: Session = Depends(get_db),
    _user: AppUser = Depends(get_current_user),
):
    """Compact map for frontend cache — any authenticated user."""
    seed_system_labels(db)
    rows = list_labels(db)
    labels = {r.key: resolve_label_value(r) for r in rows}
    defaults = {r.key: (r.default_value or "") for r in rows}
    version = "0"
    for r in rows:
        ts = _iso(getattr(r, "updated_at", None)) or ""
        if ts > version:
            version = ts
    return ResolvedLabelsResponse(labels=labels, defaults=defaults, version=version)


@router.get("", response_model=list[SystemLabelRead])
def get_labels_admin(
    q: str | None = Query(None),
    category: str | None = Query(None),
    db: Session = Depends(get_db),
    _actor: AppUser = Depends(require_super_role),
):
    seed_system_labels(db)
    return [_to_read(r) for r in list_labels(db, category=category, q=q)]


@router.patch("/{label_id}", response_model=SystemLabelRead)
def patch_label(
    label_id: int,
    body: SystemLabelUpdateBody,
    db: Session = Depends(get_db),
    _actor: AppUser = Depends(require_super_role),
):
    try:
        row = update_custom_value(db, label_id, body.custom_value)
    except LookupError:
        raise HTTPException(status_code=404, detail="Label not found") from None
    return _to_read(row)


@router.post("/seed")
def seed_labels(
    db: Session = Depends(get_db),
    _actor: AppUser = Depends(require_super_role),
):
    n = seed_system_labels(db)
    return {"ok": True, "inserted": n}
