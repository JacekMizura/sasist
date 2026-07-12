"""Printer assignment repair — pending job migration and default remapping."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import JOB_STATUS_PENDING
from ...models.printing.print_job import PrintJob
from ...models.printing.printing_default import PrintingDefault
from ...models.printing.printer_agent import PrinterAgent
from .errors import PrintingError, PrinterNotFoundError
from .printer_service import _get_agent_printer_for_tenant

logger = logging.getLogger(__name__)

OFFLINE_AGENT_QUEUE_MESSAGE = "Domyślna drukarka jest przypisana do nieaktywnego agenta."


def _is_agent_online(agent: PrinterAgent) -> bool:
    from .agent_service import is_agent_online

    return is_agent_online(agent)


def _agent_health_status(agent: PrinterAgent) -> str:
    from .agent_service import agent_health_status

    return agent_health_status(agent)


def migrate_pending_jobs(db: Session, *, old_printer_id: int, new_printer_id: int) -> int:
    if old_printer_id == new_printer_id:
        return 0
    result = db.execute(
        update(PrintJob)
        .where(
            PrintJob.printer_id == old_printer_id,
            PrintJob.status == JOB_STATUS_PENDING,
            PrintJob.deleted_at.is_(None),
        )
        .values(printer_id=new_printer_id)
    )
    count = int(result.rowcount or 0)
    if count:
        logger.info(
            "[print-assign] migrated %s pending job(s) printer_id %s -> %s",
            count,
            old_printer_id,
            new_printer_id,
        )
    return count


def find_active_replacement_printer(
    db: Session,
    *,
    inactive_row: AgentPrinter,
    agent: PrinterAgent,
) -> AgentPrinter | None:
    """Active printer with same system_name and printer_type (prefer online agents in warehouse)."""
    query = (
        db.query(AgentPrinter)
        .join(PrinterAgent, AgentPrinter.agent_id == PrinterAgent.id)
        .options(joinedload(AgentPrinter.agent))
        .filter(
            AgentPrinter.id != inactive_row.id,
            AgentPrinter.system_name == inactive_row.system_name,
            AgentPrinter.printer_type == inactive_row.printer_type,
            AgentPrinter.is_active.is_(True),
            PrinterAgent.tenant_id == agent.tenant_id,
        )
    )
    if agent.warehouse_id is not None:
        query = query.filter(PrinterAgent.warehouse_id == agent.warehouse_id)

    candidates = query.order_by(AgentPrinter.id.desc()).all()
    online: list[AgentPrinter] = []
    offline: list[AgentPrinter] = []
    for candidate in candidates:
        if candidate.agent and _is_agent_online(candidate.agent):
            online.append(candidate)
        else:
            offline.append(candidate)
    if online:
        return online[0]
    return offline[0] if offline else None


def _pick_active_printer_on_agent(
    db: Session,
    agent: PrinterAgent,
    printer_type: str,
    *,
    prefer_system_name: str | None = None,
) -> AgentPrinter | None:
    rows = (
        db.query(AgentPrinter)
        .filter(
            AgentPrinter.agent_id == agent.id,
            AgentPrinter.printer_type == printer_type,
            AgentPrinter.is_active.is_(True),
        )
        .order_by(AgentPrinter.is_default.desc(), AgentPrinter.id.asc())
        .all()
    )
    if prefer_system_name:
        for row in rows:
            if row.system_name == prefer_system_name:
                return row
    return rows[0] if rows else None


def remap_printing_defaults_for_agent(db: Session, agent: PrinterAgent) -> int:
    """Point warehouse defaults away from inactive printers to active ones on this agent."""
    if agent.warehouse_id is None:
        return 0

    remapped = 0
    defaults = (
        db.query(PrintingDefault)
        .filter(
            PrintingDefault.tenant_id == agent.tenant_id,
            PrintingDefault.warehouse_id == agent.warehouse_id,
        )
        .all()
    )
    for default in defaults:
        current = (
            db.query(AgentPrinter)
            .options(joinedload(AgentPrinter.agent))
            .filter(AgentPrinter.id == default.agent_printer_id)
            .first()
        )
        if current is not None and current.is_active:
            continue

        prefer_name = current.system_name if current is not None else None
        replacement = _pick_active_printer_on_agent(
            db,
            agent,
            default.printer_type,
            prefer_system_name=prefer_name,
        )
        if replacement is None:
            continue
        default.agent_printer_id = replacement.id
        remapped += 1
        logger.info(
            "[print-assign] remapped default type=%s -> printer_id=%s (agent_id=%s)",
            default.printer_type,
            replacement.id,
            agent.id,
        )
    return remapped


def ensure_queue_target_agent_online(
    db: Session,
    *,
    tenant_id: int,
    printer_id: int,
) -> tuple[AgentPrinter, PrinterAgent]:
    printer = _get_agent_printer_for_tenant(db, tenant_id=tenant_id, printer_id=printer_id)
    agent = printer.agent
    if agent is None:
        raise PrinterNotFoundError("Printer not found")
    if not printer.is_active:
        raise PrintingError(
            "Domyślna drukarka jest nieaktywna.",
            status_code=409,
        )
    if not _is_agent_online(agent):
        raise PrintingError(OFFLINE_AGENT_QUEUE_MESSAGE, status_code=409)
    return printer, agent


def log_print_queue(
    *,
    job_id: int,
    printer_id: int,
    agent_id: int,
    machine_id: str,
    warehouse_id: int | None,
) -> None:
    logger.info(
        "[print-queue] job_id=%s printer_id=%s agent_id=%s machine_id=%s warehouse_id=%s",
        job_id,
        printer_id,
        agent_id,
        machine_id,
        warehouse_id,
    )


def log_print_poll(
    *,
    agent_id: int,
    machine_id: str,
    active_printers: list[int],
    jobs_count: int,
    job_ids: list[int],
) -> None:
    logger.info(
        "[print-poll] agent_id=%s machine_id=%s active_printers=%s jobs_count=%s job_ids=%s",
        agent_id,
        machine_id,
        active_printers,
        jobs_count,
        job_ids,
    )


def _primary_online_agent(db: Session, *, tenant_id: int, warehouse_id: int | None) -> PrinterAgent | None:
    query = db.query(PrinterAgent).filter(PrinterAgent.tenant_id == tenant_id)
    if warehouse_id is not None:
        query = query.filter(PrinterAgent.warehouse_id == warehouse_id)
    rows = query.all()
    online = [row for row in rows if _is_agent_online(row)]
    if not online:
        return None
    return max(online, key=lambda row: row.last_seen_at or datetime.min)


def _find_replacement_for_repair(
    db: Session,
    *,
    source: AgentPrinter,
    primary_agent: PrinterAgent,
) -> AgentPrinter | None:
    replacement = _pick_active_printer_on_agent(
        db,
        primary_agent,
        source.printer_type,
        prefer_system_name=source.system_name,
    )
    if replacement:
        return replacement
    return find_active_replacement_printer(db, inactive_row=source, agent=primary_agent)


def repair_warehouse_printer_assignments(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
) -> dict[str, Any]:
    primary = _primary_online_agent(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    if primary is None:
        raise PrintingError(
            "Brak aktywnego agenta w magazynie — nie można naprawić przypisań.",
            status_code=400,
        )

    defaults_remapped = 0
    defaults_query = db.query(PrintingDefault).filter(PrintingDefault.tenant_id == tenant_id)
    if warehouse_id is not None:
        defaults_query = defaults_query.filter(PrintingDefault.warehouse_id == warehouse_id)
    for default in defaults_query.all():
        current = (
            db.query(AgentPrinter)
            .options(joinedload(AgentPrinter.agent))
            .filter(AgentPrinter.id == default.agent_printer_id)
            .first()
        )
        needs_remap = (
            current is None
            or not current.is_active
            or current.agent is None
            or not _is_agent_online(current.agent)
        )
        if not needs_remap:
            continue
        prefer_name = current.system_name if current is not None else None
        replacement = _pick_active_printer_on_agent(
            db,
            primary,
            default.printer_type,
            prefer_system_name=prefer_name,
        )
        if replacement is None:
            continue
        default.agent_printer_id = replacement.id
        defaults_remapped += 1

    jobs_migrated = 0
    pending_jobs = (
        db.query(PrintJob)
        .options(joinedload(PrintJob.printer).joinedload(AgentPrinter.agent))
        .filter(
            PrintJob.tenant_id == tenant_id,
            PrintJob.status == JOB_STATUS_PENDING,
            PrintJob.deleted_at.is_(None),
        )
    )
    if warehouse_id is not None:
        pending_jobs = pending_jobs.filter(PrintJob.warehouse_id == warehouse_id)

    for job in pending_jobs.all():
        printer = job.printer
        if printer is None:
            continue
        agent = printer.agent
        if printer.is_active and agent is not None and _is_agent_online(agent):
            continue
        replacement = _find_replacement_for_repair(db, source=printer, primary_agent=primary)
        if replacement is None:
            continue
        jobs_migrated += migrate_pending_jobs(
            db,
            old_printer_id=printer.id,
            new_printer_id=replacement.id,
        )

    db.commit()
    result = {
        "defaults_remapped": defaults_remapped,
        "jobs_migrated": jobs_migrated,
        "primary_agent_id": primary.id,
        "primary_machine_id": primary.machine_id,
    }
    logger.info("[print-assign] repair tenant_id=%s warehouse_id=%s %s", tenant_id, warehouse_id, result)
    return result


def agent_printer_status_fields(agent: PrinterAgent | None) -> dict[str, Any]:
    if agent is None:
        return {"agent_is_online": False, "agent_health_status": "offline"}
    return {
        "agent_is_online": _is_agent_online(agent),
        "agent_health_status": _agent_health_status(agent),
    }
