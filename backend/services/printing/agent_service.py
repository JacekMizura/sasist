"""Printer agent registration, heartbeat, and listing."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import OFFLINE_THRESHOLD_MINUTES, STALE_HEARTBEAT_SECONDS
from ...models.printing.printer_agent import PrinterAgent
from ...models.integration_api_key import IntegrationApiKey
from ...schemas.printing.agent import AgentRegisterRequest
from .agent_auth_service import generate_agent_token, hash_agent_token
from .printer_service import sync_agent_printers


def _upsert_registered_agent(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    payload: AgentRegisterRequest,
) -> tuple[PrinterAgent, str]:
    now = datetime.utcnow()
    agent = (
        db.query(PrinterAgent)
        .filter(
            PrinterAgent.tenant_id == tenant_id,
            PrinterAgent.machine_id == payload.machine_id.strip(),
        )
        .first()
    )
    plain_token = generate_agent_token()
    token_hash = hash_agent_token(plain_token)

    if agent is None:
        agent = PrinterAgent(
            tenant_id=tenant_id,
            machine_id=payload.machine_id.strip(),
            name=payload.name.strip(),
            token_hash=token_hash,
            version=payload.version,
            warehouse_id=warehouse_id,
            last_seen_at=now,
            is_online=True,
        )
        db.add(agent)
        db.flush()
    else:
        agent.name = payload.name.strip()
        agent.version = payload.version
        agent.warehouse_id = warehouse_id
        agent.token_hash = token_hash
        agent.last_seen_at = now
        agent.is_online = True
        agent.updated_at = now

    sync_agent_printers(db, agent, payload.printers)
    db.commit()
    db.refresh(agent)
    return agent, plain_token


def is_agent_online(agent: PrinterAgent, *, now: datetime | None = None) -> bool:
    if agent.last_seen_at is None:
        return False
    reference = now or datetime.utcnow()
    return agent.last_seen_at >= reference - timedelta(minutes=OFFLINE_THRESHOLD_MINUTES)


def agent_health_status(agent: PrinterAgent, *, now: datetime | None = None) -> str:
    if agent.last_seen_at is None:
        return "offline"
    reference = now or datetime.utcnow()
    seconds = (reference - agent.last_seen_at).total_seconds()
    if seconds <= STALE_HEARTBEAT_SECONDS:
        return "online"
    if is_agent_online(agent, now=reference):
        return "stale"
    return "offline"


def register_agent(
    db: Session,
    *,
    tenant_id: int,
    payload: AgentRegisterRequest,
) -> tuple[PrinterAgent, str]:
    """Legacy registration — tenant_id and warehouse_id from request (deprecated)."""
    warehouse_id = payload.warehouse_id
    return _upsert_registered_agent(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        payload=payload,
    )


def register_agent_with_api_key(
    db: Session,
    *,
    api_key: IntegrationApiKey,
    payload: AgentRegisterRequest,
) -> tuple[PrinterAgent, str]:
    """Register agent scoped by integration API key (tenant + warehouse from key)."""
    if api_key.type != "printer_agent":
        from .errors import PrintingError

        raise PrintingError("API key type must be printer_agent", status_code=403)
    if api_key.warehouse_id is None:
        from .errors import PrintingError

        raise PrintingError("Printer agent API key is missing warehouse scope", status_code=403)

    return _upsert_registered_agent(
        db,
        tenant_id=int(api_key.tenant_id),
        warehouse_id=int(api_key.warehouse_id),
        payload=payload,
    )


def record_agent_heartbeat(
    db: Session,
    agent: PrinterAgent,
    *,
    version: str | None = None,
    name: str | None = None,
    printer_count: int | None = None,
    last_poll_at: datetime | None = None,
    last_error: str | None = None,
) -> PrinterAgent:
    now = datetime.utcnow()
    agent.last_seen_at = now
    agent.is_online = True
    agent.updated_at = now
    if version is not None:
        normalized = version.strip()
        if normalized:
            agent.version = normalized[:32]
    if name is not None:
        normalized_name = name.strip()
        if normalized_name:
            agent.name = normalized_name[:120]
    if printer_count is not None:
        agent.printer_count = max(0, int(printer_count))
    if last_poll_at is not None:
        agent.last_poll_at = last_poll_at
    if last_error is not None:
        agent.last_error = last_error.strip()[:2000] if last_error.strip() else None
    db.commit()
    db.refresh(agent)
    return agent


def _resolve_printer_count(db: Session, agent: PrinterAgent) -> int:
    if agent.printer_count is not None:
        return int(agent.printer_count)
    from sqlalchemy import func

    count = (
        db.query(func.count(AgentPrinter.id))
        .filter(AgentPrinter.agent_id == agent.id, AgentPrinter.is_active.is_(True))
        .scalar()
    )
    return int(count or 0)


def _agent_update_available(reported: str | None, latest: str | None) -> bool:
    if not reported or not latest:
        return False
    left = [int(part or 0) for part in reported.strip().lstrip("vV").split(".")]
    right = [int(part or 0) for part in latest.strip().lstrip("vV").split(".")]
    length = max(len(left), len(right))
    for index in range(length):
        a = left[index] if index < len(left) else 0
        b = right[index] if index < len(right) else 0
        if a < b:
            return True
        if a > b:
            return False
    return False


def get_agent_diagnostics(
    db: Session,
    *,
    tenant_id: int,
    agent_id: int,
) -> dict:
    from .errors import PrintingError
    from .github_release_service import get_latest_printer_agent_release

    agent = (
        db.query(PrinterAgent)
        .filter(PrinterAgent.tenant_id == tenant_id, PrinterAgent.id == agent_id)
        .first()
    )
    if agent is None:
        raise PrintingError("Agent not found", status_code=404)

    release = get_latest_printer_agent_release()
    latest_version = release.version
    reported_version = agent.version
    return {
        "version": reported_version,
        "latest_version": latest_version,
        "last_heartbeat": agent.last_seen_at,
        "last_poll": agent.last_poll_at,
        "printer_count": _resolve_printer_count(db, agent),
        "config_version": reported_version,
        "machine_id": agent.machine_id,
        "warehouse_id": agent.warehouse_id,
        "update_available": _agent_update_available(reported_version, latest_version),
    }


def list_agents(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[dict]:
    query = db.query(PrinterAgent).filter(PrinterAgent.tenant_id == tenant_id)
    if warehouse_id is not None:
        query = query.filter(PrinterAgent.warehouse_id == warehouse_id)
    rows = query.order_by(PrinterAgent.name.asc()).all()
    now = datetime.utcnow()

    return [
        {
            "id": row.id,
            "tenant_id": row.tenant_id,
            "warehouse_id": row.warehouse_id,
            "machine_id": row.machine_id,
            "name": row.name,
            "version": row.version,
            "last_seen_at": row.last_seen_at,
            "last_poll_at": row.last_poll_at,
            "last_error": row.last_error,
            "is_online": is_agent_online(row, now=now),
            "health_status": agent_health_status(row, now=now),
            "printer_count": _resolve_printer_count(db, row),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]
