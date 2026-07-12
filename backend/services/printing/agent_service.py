"""Printer agent registration, heartbeat, and listing."""

from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import OFFLINE_THRESHOLD_MINUTES, STALE_HEARTBEAT_SECONDS
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.printing.agent import AgentRegisterRequest
from .agent_auth_service import generate_agent_token, hash_agent_token
from .printer_service import sync_agent_printers


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
            warehouse_id=payload.warehouse_id,
            last_seen_at=now,
            is_online=True,
        )
        db.add(agent)
        db.flush()
    else:
        agent.name = payload.name.strip()
        agent.version = payload.version
        agent.warehouse_id = payload.warehouse_id
        agent.token_hash = token_hash
        agent.last_seen_at = now
        agent.is_online = True
        agent.updated_at = now

    sync_agent_printers(db, agent, payload.printers)
    db.commit()
    db.refresh(agent)
    return agent, plain_token


def record_agent_heartbeat(
    db: Session,
    agent: PrinterAgent,
    *,
    last_poll_at: datetime | None = None,
    last_error: str | None = None,
) -> PrinterAgent:
    now = datetime.utcnow()
    agent.last_seen_at = now
    agent.is_online = True
    agent.updated_at = now
    if last_poll_at is not None:
        agent.last_poll_at = last_poll_at
    if last_error is not None:
        agent.last_error = last_error.strip()[:2000] if last_error.strip() else None
    db.commit()
    db.refresh(agent)
    return agent


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

    printer_counts: dict[int, int] = {}
    if rows:
        from sqlalchemy import func

        agent_ids = [row.id for row in rows]
        for agent_id, count in (
            db.query(AgentPrinter.agent_id, func.count(AgentPrinter.id))
            .filter(AgentPrinter.agent_id.in_(agent_ids), AgentPrinter.is_active.is_(True))
            .group_by(AgentPrinter.agent_id)
            .all()
        ):
            printer_counts[int(agent_id)] = int(count)

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
            "printer_count": printer_counts.get(row.id, 0),
            "created_at": row.created_at,
            "updated_at": row.updated_at,
        }
        for row in rows
    ]
