"""Workstation printer mapping by print profile (not WMS modules)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.printer_agent import PrinterAgent
from ...models.wms_workstations import WorkstationPrinterMapping
from ...models.wms_workstations.constants import EVENT_PRINTER_MAPPING_CHANGED
from ...printing_profiles import (
    PRINT_PROFILE_ICONS,
    PRINT_PROFILE_LABELS_PL,
    PRINT_PROFILES,
    normalize_print_profile,
)
from ...services.printing.agent_service import is_agent_online
from .errors import WorkstationError
from .serialize import append_event


def get_printers_config(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
) -> dict[str, Any]:
    from .service import get_workstation_or_404

    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    available: list[dict[str, Any]] = []
    online = False
    if row.printer_agent_id is not None:
        try:
            from ...services.agent.device_registry_service import (
                ensure_agent_printers_from_edge_devices,
            )

            ensure_agent_printers_from_edge_devices(db, agent_id=int(row.printer_agent_id))
        except Exception:
            pass
        agent = db.query(PrinterAgent).filter(PrinterAgent.id == row.printer_agent_id).first()
        online = is_agent_online(agent) if agent else False
        printers = (
            db.query(AgentPrinter)
            .filter(
                AgentPrinter.agent_id == row.printer_agent_id,
                AgentPrinter.is_active.is_(True),
            )
            .order_by(AgentPrinter.name.asc())
            .all()
        )
        for p in printers:
            available.append(
                {
                    "id": p.id,
                    "name": p.name or p.system_name,
                    "system_name": p.system_name,
                    "status": "online" if online else "offline",
                    "is_online": online,
                }
            )

    existing = {
        str(m.print_profile): m
        for m in db.query(WorkstationPrinterMapping)
        .filter(WorkstationPrinterMapping.workstation_id == row.id)
        .all()
    }
    mappings: list[dict[str, Any]] = []
    printer_by_id = {p["id"]: p for p in available}
    for profile in PRINT_PROFILES:
        m = existing.get(profile)
        printer_id = m.agent_printer_id if m else None
        printer = printer_by_id.get(printer_id) if printer_id else None
        label = PRINT_PROFILE_LABELS_PL.get(profile, profile)
        mappings.append(
            {
                "print_profile": profile,
                "print_profile_label": label,
                "print_profile_icon": PRINT_PROFILE_ICONS.get(profile),
                # Backward-compatible aliases for older FE builds
                "print_type": profile,
                "print_type_label": label,
                "agent_printer_id": printer_id if printer else None,
                "printer_name": printer["name"] if printer else None,
                "status": printer["status"] if printer else None,
            }
        )
    return {"mappings": mappings, "available_printers": available}


def put_printer_mapping(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
    mappings: list[dict[str, Any]],
    actor_user_id: int | None = None,
) -> dict[str, Any]:
    from .service import get_workstation_or_404

    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    if row.printer_agent_id is None:
        raise WorkstationError("Najpierw połącz komputer ze stanowiskiem")

    try:
        from ...services.agent.device_registry_service import (
            ensure_agent_printers_from_edge_devices,
        )

        ensure_agent_printers_from_edge_devices(db, agent_id=int(row.printer_agent_id))
    except Exception:
        pass

    allowed_ids = {
        p.id
        for p in db.query(AgentPrinter)
        .filter(
            AgentPrinter.agent_id == row.printer_agent_id,
            AgentPrinter.is_active.is_(True),
        )
        .all()
    }
    changes: list[str] = []
    for item in mappings:
        raw_profile = item.get("print_profile") or item.get("print_type")
        profile = normalize_print_profile(str(raw_profile) if raw_profile is not None else None)
        if profile is None or profile not in PRINT_PROFILES:
            raise WorkstationError(f"Nieznany profil wydruku: {raw_profile}")
        raw_id = item.get("agent_printer_id")
        existing = (
            db.query(WorkstationPrinterMapping)
            .filter(
                WorkstationPrinterMapping.workstation_id == row.id,
                WorkstationPrinterMapping.print_profile == profile,
            )
            .first()
        )
        label = PRINT_PROFILE_LABELS_PL.get(profile, profile)
        if raw_id is None or raw_id == "":
            if existing is not None:
                db.delete(existing)
                changes.append(f"{label} → (brak)")
            continue
        printer_id = int(raw_id)
        if printer_id not in allowed_ids:
            raise WorkstationError(
                "Drukarka musi należeć do komputera przypisanego do tego stanowiska"
            )
        printer = db.query(AgentPrinter).filter(AgentPrinter.id == printer_id).first()
        printer_name = (printer.name or printer.system_name) if printer else str(printer_id)
        if existing is None:
            db.add(
                WorkstationPrinterMapping(
                    workstation_id=row.id,
                    print_profile=profile,
                    agent_printer_id=printer_id,
                )
            )
            changes.append(f"{label} → {printer_name}")
        elif existing.agent_printer_id != printer_id:
            existing.agent_printer_id = printer_id
            changes.append(f"{label} → {printer_name}")

    if changes:
        append_event(
            db,
            tenant_id=tenant_id,
            workstation_id=row.id,
            event_type=EVENT_PRINTER_MAPPING_CHANGED,
            title="Zmieniono konfigurację drukowania",
            detail="; ".join(changes),
            actor_user_id=actor_user_id,
        )
    return get_printers_config(db, tenant_id=tenant_id, workstation_id=workstation_id)
