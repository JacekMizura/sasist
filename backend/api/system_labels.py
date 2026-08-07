"""System labels API — resolved map for frontend cache."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..auth.deps import get_current_user
from ..database import get_db
from ..models.app_user import AppUser
from ..services.system_label_service import (
    list_labels,
    resolve_label_value,
    seed_system_labels,
)

router = APIRouter(prefix="/system/labels", tags=["System Labels"])


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
