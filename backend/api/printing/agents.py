"""Printer agent registration, heartbeat, and listing."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ...auth.api_key_deps import client_ip_from_request, user_agent_from_request
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
from ...services.api_keys.api_key_service import extract_raw_api_key, validate_key
from ...services.api_keys.errors import ApiKeyError, ApiKeyRateLimitError, ApiKeyValidationError
from ...services.printing.agent_auth_service import get_current_agent
from ...services.printing.agent_service import (
    is_agent_online,
    list_agents,
    record_agent_heartbeat,
    register_agent,
    register_agent_with_api_key,
)
from ...services.printing.errors import PrintingError
from ...services.printing.test_page_service import create_agent_test_page_job
from ...services.printing.job_service import serialize_print_job
from ...schemas.printing.job import PrintJobRead
from ._helpers import raise_printing_error

router = APIRouter()
_http_bearer = HTTPBearer(auto_error=False)


@router.post("/agents/register", response_model=AgentRegisterResponse)
def register_printing_agent(
    payload: AgentRegisterRequest,
    request: Request,
    tenant_id: int | None = Query(default=None, ge=1),
    cred: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
    db: Session = Depends(get_db),
):
    api_key_raw = extract_raw_api_key(cred)

    try:
        if api_key_raw:
            api_key = validate_key(
                db,
                api_key_raw,
                expected_type="printer_agent",
                required_scope="printing.agent",
                client_ip=client_ip_from_request(request),
                user_agent=user_agent_from_request(request),
            )
            agent, token = register_agent_with_api_key(db, api_key=api_key, payload=payload)
            db.commit()
        elif tenant_id is not None:
            agent, token = register_agent(db, tenant_id=tenant_id, payload=payload)
        else:
            raise HTTPException(
                status_code=401,
                detail="Authorization Bearer API key required (legacy: tenant_id query param)",
            )
    except ApiKeyRateLimitError as exc:
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ApiKeyValidationError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ApiKeyError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PrintingError as exc:
        raise_printing_error(exc)

    return AgentRegisterResponse(
        agent_id=agent.id,
        token=token,
        machine_id=agent.machine_id,
        tenant_id=agent.tenant_id,
        warehouse_id=agent.warehouse_id,
    )


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
