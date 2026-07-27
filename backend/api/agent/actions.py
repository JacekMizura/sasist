"""Remote actions queue — ERP enqueues; agent pulls via sync."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.agent.devices import (
    ActionResultRequest,
    CreateActionRequest,
    EdgeDeviceActionRead,
)
from ...services.agent.device_registry_service import (
    enqueue_action,
    list_actions,
    record_action_result,
)
from ...services.agent.security import (
    assert_user_may_enqueue_action,
    enforce_agent_rate_limit,
    validate_action_result_payload_size,
    validate_replay_headers,
)
from ...services.printing.agent_auth_service import get_current_agent

router = APIRouter()


@router.get("/actions", response_model=list[EdgeDeviceActionRead])
def get_actions(
    tenant_id: int = Query(..., ge=1),
    agent_id: int | None = Query(default=None, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_actions(db, tenant_id=tenant_id, agent_id=agent_id, limit=limit)


@router.post("/actions", response_model=EdgeDeviceActionRead)
def post_action(
    payload: CreateActionRequest,
    tenant_id: int = Query(..., ge=1),
    user: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    assert_user_may_enqueue_action(db, user, payload.action)
    try:
        row = enqueue_action(db, tenant_id=tenant_id, payload=payload)
        db.commit()
        return row
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.post("/actions/result", response_model=EdgeDeviceActionRead)
def post_action_result(
    payload: ActionResultRequest,
    request: Request,
    agent: PrinterAgent = Depends(get_current_agent),
    _: None = Depends(validate_replay_headers),
    db: Session = Depends(get_db),
):
    enforce_agent_rate_limit(request, f"agent:{agent.id}")
    validate_action_result_payload_size(payload.data)
    try:
        row = record_action_result(db, agent, payload)
        db.commit()
        return row
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
