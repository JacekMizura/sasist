"""GET /agent/modules — modules reported by edge agents (type-agnostic)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...schemas.agent.devices import EdgeModuleRead
from ...services.agent.device_registry_service import list_edge_modules

router = APIRouter()


@router.get("/modules", response_model=list[EdgeModuleRead])
def get_agent_modules(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_edge_modules(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
