"""Agent printer sync, patch, and tenant default selection."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session, joinedload

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import PRINTER_TYPE_A4, PRINTER_TYPE_LABEL, PRINTER_TYPE_RECEIPT
from ...models.printing.printing_default import PrintingDefault
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.printing.agent import RegisterAgentPrinterPayload
from ...schemas.printing.defaults import PrintingDefaultsUpdate
from ...schemas.printing.printer import AgentPrinterPatch
from .constants import DEFAULT_PRINTER_TYPE_FIELDS, PRINTER_TYPES
from .errors import PrinterNotFoundError, TenantScopeError


def _capabilities_to_text(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False)


def enforce_single_default(
    db: Session,
    *,
    agent_id: int,
    printer_type: str,
    keep_printer_id: int | None = None,
) -> None:
    query = db.query(AgentPrinter).filter(
        AgentPrinter.agent_id == agent_id,
        AgentPrinter.printer_type == printer_type,
        AgentPrinter.is_default.is_(True),
    )
    if keep_printer_id is not None:
        query = query.filter(AgentPrinter.id != keep_printer_id)
    for row in query.all():
        row.is_default = False


def sync_agent_printers(
    db: Session,
    agent: PrinterAgent,
    printers: list[RegisterAgentPrinterPayload],
) -> None:
    existing_rows = (
        db.query(AgentPrinter)
        .filter(AgentPrinter.agent_id == agent.id)
        .all()
    )
    existing_by_system = {row.system_name: row for row in existing_rows}
    incoming_names = {item.system_name for item in printers}

    for item in printers:
        row = existing_by_system.get(item.system_name)
        if row is None:
            row = AgentPrinter(
                agent_id=agent.id,
                name=item.name.strip(),
                system_name=item.system_name.strip(),
                printer_type=item.printer_type,
                is_default=item.is_default,
                capabilities_json=_capabilities_to_text(item.capabilities_json),
                is_active=True,
            )
            db.add(row)
            db.flush()
        else:
            row.name = item.name.strip()
            row.printer_type = item.printer_type
            row.is_default = item.is_default
            row.capabilities_json = _capabilities_to_text(item.capabilities_json)
            row.is_active = True
            row.updated_at = agent.updated_at

        if item.is_default:
            enforce_single_default(
                db,
                agent_id=agent.id,
                printer_type=item.printer_type,
                keep_printer_id=row.id,
            )

    for system_name, row in existing_by_system.items():
        if system_name not in incoming_names:
            from .assignment_service import find_active_replacement_printer, migrate_pending_jobs

            replacement = find_active_replacement_printer(db, inactive_row=row, agent=agent)
            if replacement is not None:
                migrate_pending_jobs(db, old_printer_id=row.id, new_printer_id=replacement.id)
            row.is_active = False

    for printer_type in PRINTER_TYPES:
        defaults = [
            row
            for row in db.query(AgentPrinter)
            .filter(
                AgentPrinter.agent_id == agent.id,
                AgentPrinter.printer_type == printer_type,
                AgentPrinter.is_default.is_(True),
                AgentPrinter.is_active.is_(True),
            )
            .all()
        ]
        if len(defaults) <= 1:
            continue
        keep = defaults[0]
        enforce_single_default(
            db,
            agent_id=agent.id,
            printer_type=printer_type,
            keep_printer_id=keep.id,
        )


def _get_agent_printer_for_tenant(db: Session, *, tenant_id: int, printer_id: int) -> AgentPrinter:
    row = (
        db.query(AgentPrinter)
        .options(joinedload(AgentPrinter.agent))
        .filter(AgentPrinter.id == printer_id)
        .first()
    )
    if row is None or row.agent is None:
        raise PrinterNotFoundError("Printer not found")
    if row.agent.tenant_id != tenant_id:
        raise TenantScopeError("Printer outside tenant scope")
    return row


def list_agent_printers(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    agent_id: int | None = None,
) -> list[AgentPrinter]:
    query = (
        db.query(AgentPrinter)
        .join(PrinterAgent, AgentPrinter.agent_id == PrinterAgent.id)
        .options(joinedload(AgentPrinter.agent))
        .filter(PrinterAgent.tenant_id == tenant_id)
    )
    if warehouse_id is not None:
        query = query.filter(PrinterAgent.warehouse_id == warehouse_id)
    if agent_id is not None:
        query = query.filter(AgentPrinter.agent_id == agent_id)
    return query.order_by(AgentPrinter.name.asc()).all()


def list_system_printer_names(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    online_only: bool = False,
) -> list[str]:
    """Distinct OS printer names reported by active agent printers."""
    from .agent_service import is_agent_online

    rows = list_agent_printers(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
    )
    names: list[str] = []
    seen: set[str] = set()
    for row in rows:
        if not row.is_active:
            continue
        agent = row.agent
        if online_only and agent is not None and not is_agent_online(agent):
            continue
        system_name = (row.system_name or "").strip()
        if not system_name or system_name in seen:
            continue
        seen.add(system_name)
        names.append(system_name)
    return sorted(names, key=str.casefold)


def patch_agent_printer(
    db: Session,
    *,
    tenant_id: int,
    printer_id: int,
    patch: AgentPrinterPatch,
) -> AgentPrinter:
    row = _get_agent_printer_for_tenant(db, tenant_id=tenant_id, printer_id=printer_id)
    data = patch.model_dump(exclude_unset=True)

    if "name" in data and data["name"] is not None:
        row.name = data["name"].strip()
    if "printer_type" in data and data["printer_type"] is not None:
        row.printer_type = data["printer_type"]
    if "is_active" in data and data["is_active"] is not None:
        row.is_active = data["is_active"]
    if "is_default" in data and data["is_default"] is not None:
        row.is_default = data["is_default"]
        if row.is_default:
            enforce_single_default(
                db,
                agent_id=row.agent_id,
                printer_type=row.printer_type,
                keep_printer_id=row.id,
            )

    db.commit()
    db.refresh(row)
    return row


def get_printing_defaults(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> dict[str, Any]:
    rows = (
        db.query(PrintingDefault)
        .filter(
            PrintingDefault.tenant_id == tenant_id,
            PrintingDefault.warehouse_id == warehouse_id,
        )
        .all()
    )
    by_type = {row.printer_type: row.agent_printer_id for row in rows}
    return {
        "tenant_id": tenant_id,
        "warehouse_id": warehouse_id,
        "a4_printer_id": by_type.get(PRINTER_TYPE_A4),
        "label_printer_id": by_type.get(PRINTER_TYPE_LABEL),
        "receipt_printer_id": by_type.get(PRINTER_TYPE_RECEIPT),
    }


def upsert_printing_defaults(
    db: Session,
    *,
    tenant_id: int,
    payload: PrintingDefaultsUpdate,
) -> dict[str, Any]:
    warehouse_id = payload.warehouse_id
    updates = payload.model_dump(exclude_unset=True)
    updates.pop("warehouse_id", None)

    for field_name, printer_type in DEFAULT_PRINTER_TYPE_FIELDS.items():
        if field_name not in updates:
            continue
        printer_id = updates[field_name]
        existing = (
            db.query(PrintingDefault)
            .filter(
                PrintingDefault.tenant_id == tenant_id,
                PrintingDefault.warehouse_id == warehouse_id,
                PrintingDefault.printer_type == printer_type,
            )
            .first()
        )
        if printer_id is None:
            if existing is not None:
                db.delete(existing)
            continue

        _get_agent_printer_for_tenant(db, tenant_id=tenant_id, printer_id=printer_id)
        if existing is None:
            db.add(
                PrintingDefault(
                    tenant_id=tenant_id,
                    warehouse_id=warehouse_id,
                    printer_type=printer_type,
                    agent_printer_id=printer_id,
                )
            )
        else:
            existing.agent_printer_id = printer_id

    db.commit()
    return get_printing_defaults(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
