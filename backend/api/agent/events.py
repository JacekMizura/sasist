"""Device events listing for ERP UI."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.agent.devices import EdgeDeviceEventRead
from ...services.agent.device_registry_service import list_events

router = APIRouter()


@router.get("/events", response_model=list[EdgeDeviceEventRead])
def get_events(
    tenant_id: int = Query(..., ge=1),
    agent_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=100, ge=1, le=500),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_events(db, tenant_id=tenant_id, agent_id=agent_id, limit=limit)
