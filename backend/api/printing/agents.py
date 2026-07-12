"""Printer agent registration, heartbeat, and listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.orm import Session

from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.printing.agent import (
    AgentHeartbeatRequest,
    AgentHeartbeatResponse,
    AgentRegisterRequest,
    AgentRegisterResponse,
    PrinterAgentRead,
)
from ...services.printing.agent_auth_service import get_current_agent
from ...services.printing.agent_service import (
    is_agent_online,
    list_agents,
    record_agent_heartbeat,
    register_agent,
)
from ...services.printing.errors import PrintingError
from ...services.printing.test_page_service import create_agent_test_page_job
from ...services.printing.job_service import serialize_print_job
from ...schemas.printing.job import PrintJobRead
from ._helpers import raise_printing_error

router = APIRouter()


@router.post("/agents/register", response_model=AgentRegisterResponse)
def register_printing_agent(
    payload: AgentRegisterRequest,
    tenant_id: int = Query(..., ge=1),
    db: Session = Depends(get_db),
):
    try:
        agent, token = register_agent(db, tenant_id=tenant_id, payload=payload)
    except PrintingError as exc:
        raise_printing_error(exc)
    return AgentRegisterResponse(agent_id=agent.id, token=token, machine_id=agent.machine_id)


@router.post("/agents/heartbeat", response_model=AgentHeartbeatResponse)
def agent_heartbeat(
    payload: AgentHeartbeatRequest | None = None,
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    body = payload or AgentHeartbeatRequest()
    updated = record_agent_heartbeat(
        db,
        agent,
        last_poll_at=body.last_poll_at,
        last_error=body.last_error,
    )
    return AgentHeartbeatResponse(
        agent_id=updated.id,
        is_online=is_agent_online(updated),
        last_seen_at=updated.last_seen_at,
    )


@router.post("/agents/{agent_id}/test-page", response_model=PrintJobRead)
def agent_test_page(
    agent_id: int,
    request: Request,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    api_base = str(request.base_url).rstrip("/")
    try:
        job = create_agent_test_page_job(
            db,
            tenant_id=tenant_id,
            agent_id=agent_id,
            api_base_url=api_base,
        )
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.post("/agents/self/test-page", response_model=PrintJobRead)
def agent_self_test_page(
    request: Request,
    agent: PrinterAgent = Depends(get_current_agent),
    db: Session = Depends(get_db),
):
    api_base = str(request.base_url).rstrip("/")
    try:
        job = create_agent_test_page_job(
            db,
            tenant_id=agent.tenant_id,
            agent_id=agent.id,
            api_base_url=api_base,
        )
    except PrintingError as exc:
        raise_printing_error(exc)
    return serialize_print_job(job)


@router.get("/agents", response_model=list[PrinterAgentRead])
def get_printing_agents(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int | None = Query(default=None, ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return list_agents(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
