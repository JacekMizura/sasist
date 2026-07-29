"""Printer agent registration, heartbeat, and listing."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from ...auth.api_key_deps import client_ip_from_request, user_agent_from_request
from ...auth.deps import get_current_user
from ...database import get_db
from ...models.app_user import AppUser
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.printing.agent import (
    AgentDiagnosticsRead,
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
    get_agent_diagnostics,
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
logger = logging.getLogger(__name__)


@router.post("/agents/register", response_model=AgentRegisterResponse)
def register_printing_agent(
    payload: AgentRegisterRequest,
    request: Request,
    cred: HTTPAuthorizationCredentials | None = Depends(_http_bearer),
    db: Session = Depends(get_db),
):
    from ...services.wms_workstations import (
        WorkstationError,
        attach_agent_to_workstation,
        claim_pairing_code,
        looks_like_pairing_code,
        try_attach_agent_after_register,
    )
    from ...services.api_keys.api_key_service import record_key_usage

    api_key_raw = extract_raw_api_key(cred)
    pairing_candidate = None
    if (
        not api_key_raw
        and cred is not None
        and cred.scheme.lower() == "bearer"
        and cred.credentials
    ):
        candidate = cred.credentials.strip()
        if looks_like_pairing_code(candidate):
            pairing_candidate = candidate

    logger.info(
        "printing.agents.register received machine_id=%s has_pairing_code=%s has_api_key=%s",
        getattr(payload, "machine_id", None),
        bool(pairing_candidate),
        bool(api_key_raw),
    )

    agent = None
    token = None
    try:
        workstation_for_pair = None
        if pairing_candidate:
            api_key, workstation_for_pair = claim_pairing_code(
                db,
                pairing_candidate,
                client_ip=client_ip_from_request(request),
            )
            logger.info(
                "printing.agents.register claim_ok workstation_id=%s api_key_id=%s tenant_id=%s",
                workstation_for_pair.id,
                api_key.id,
                api_key.tenant_id,
            )
            record_key_usage(
                db,
                api_key,
                client_ip=client_ip_from_request(request),
                user_agent=user_agent_from_request(request),
            )
        elif api_key_raw:
            api_key = validate_key(
                db,
                api_key_raw,
                expected_type="printer_agent",
                required_scope="printing.agent",
                client_ip=client_ip_from_request(request),
                user_agent=user_agent_from_request(request),
            )
            logger.info(
                "printing.agents.register api_key_ok key_id=%s tenant_id=%s",
                api_key.id,
                api_key.tenant_id,
            )
        else:
            raise HTTPException(
                status_code=401,
                detail="Authorization Bearer API key required",
            )

        # Single transaction: register + attach + invalidate pairing code + events.
        agent, token = register_agent_with_api_key(db, api_key=api_key, payload=payload)
        logger.info(
            "printing.agents.register agent_upsert_ok agent_id=%s machine_id=%s",
            agent.id,
            agent.machine_id,
        )
        if workstation_for_pair is not None:
            attach_agent_to_workstation(
                db,
                workstation=workstation_for_pair,
                agent=agent,
                api_key=api_key,
            )
            logger.info(
                "printing.agents.register attach_ok workstation_id=%s agent_id=%s",
                workstation_for_pair.id,
                agent.id,
            )
        else:
            attached = try_attach_agent_after_register(db, api_key=api_key, agent=agent)
            logger.info(
                "printing.agents.register try_attach workstation_id=%s agent_id=%s",
                attached.id if attached else None,
                agent.id,
            )
        db.commit()
        db.refresh(agent)
        logger.info(
            "printing.agents.register commit_ok agent_id=%s warehouse_id=%s",
            agent.id,
            agent.warehouse_id,
        )
    except WorkstationError as exc:
        db.rollback()
        logger.warning(
            "printing.agents.register claim_or_attach_failed status=%s detail=%s",
            exc.status_code,
            exc.message,
        )
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except ApiKeyRateLimitError as exc:
        db.rollback()
        raise HTTPException(status_code=429, detail=str(exc)) from exc
    except ApiKeyValidationError as exc:
        db.rollback()
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except ApiKeyError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except PrintingError as exc:
        db.rollback()
        raise_printing_error(exc)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise

    assert agent is not None and token is not None
    return AgentRegisterResponse(
        agent_id=agent.id,
        token=token,
        machine_id=agent.machine_id,
        tenant_id=agent.tenant_id,
        warehouse_id=agent.warehouse_id,
        company_name=_resolve_company_name(db, agent.tenant_id),
        warehouse_name=_resolve_warehouse_name(db, agent.warehouse_id),
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
        version=body.version,
        name=body.name,
        printer_count=body.printer_count,
        last_poll_at=body.last_poll_at,
        last_error=body.last_error,
        supported_formats=body.supported_formats,
        capabilities=body.capabilities,
    )
    logger.info(
        "printing.agents.heartbeat agent_id=%s is_online=%s printer_count=%s",
        updated.id,
        is_agent_online(updated),
        body.printer_count,
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
    rows = list_agents(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    online_count = sum(1 for row in rows if row.get("is_online"))
    printer_count = sum(int(row.get("printer_count") or 0) for row in rows)
    logger.debug(
        "GET /printing/agents tenant_id=%s warehouse_id=%s -> %s agents (%s online, %s printers)",
        tenant_id,
        warehouse_id,
        len(rows),
        online_count,
        printer_count,
    )
    return rows


@router.get("/agents/{agent_id}/diagnostics", response_model=AgentDiagnosticsRead)
def get_printing_agent_diagnostics(
    agent_id: int,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        return get_agent_diagnostics(db, tenant_id=tenant_id, agent_id=agent_id)
    except PrintingError as exc:
        raise_printing_error(exc)


@router.post("/agents/{agent_id}/sync-printers")
def request_agent_printer_sync(
    agent_id: int,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
):
    """Placeholder for future remote printer sync — agent-side sync remains authoritative."""
    raise HTTPException(
        status_code=501,
        detail="Zdalna synchronizacja drukarek będzie dostępna w kolejnej wersji. Użyj Synchronizuj drukarki w agencie.",
    )


@router.post("/agents/{agent_id}/restart")
def request_agent_restart(
    agent_id: int,
    tenant_id: int = Query(..., ge=1),
    _: AppUser = Depends(get_current_user),
):
    """Placeholder for future remote agent restart."""
    raise HTTPException(
        status_code=501,
        detail="Zdalny restart agenta będzie dostępny w kolejnej wersji.",
    )


def _resolve_company_name(db: Session, tenant_id: int | None) -> str | None:
    if tenant_id is None:
        return None
    try:
        from ...models.tenant import Tenant

        row = db.query(Tenant).filter(Tenant.id == int(tenant_id)).first()
        if row is None:
            return None
        return (row.company_name or row.name or "").strip() or None
    except Exception:
        return None


def _resolve_warehouse_name(db: Session, warehouse_id: int | None) -> str | None:
    if warehouse_id is None:
        return None
    try:
        from ...models.warehouse import Warehouse

        row = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
        if row is None:
            return None
        return (row.name or "").strip() or None
    except Exception:
        return None
