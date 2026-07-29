"""Serialize workstations and emit timeline events."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from ...models.integration_api_key import IntegrationApiKey
from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.printer_agent import PrinterAgent
from ...models.wms_workstations import (
    STATION_TYPE_LABELS_PL,
    WmsWorkstation,
    WorkstationEvent,
)
from ...models.wms_workstations.constants import STATION_TYPE_OTHER
from ...services.printing.agent_service import agent_health_status, is_agent_online


def _warehouse_names_batch(db: Session, warehouse_ids: set[int]) -> dict[int, str]:
    if not warehouse_ids:
        return {}
    from sqlalchemy import text

    names: dict[int, str] = {}
    # Small N (tenant warehouses); one query via IN.
    placeholders = ", ".join(f":w{i}" for i in range(len(warehouse_ids)))
    params = {f"w{i}": wid for i, wid in enumerate(warehouse_ids)}
    rows = db.execute(
        text(f"SELECT id, name FROM warehouses WHERE id IN ({placeholders})"),
        params,
    ).fetchall()
    for row in rows:
        wid = int(row[0])
        names[wid] = str(row[1]) if row[1] else f"Magazyn #{wid}"
    for wid in warehouse_ids:
        names.setdefault(wid, f"Magazyn #{wid}")
    return names


def _parse_os_from_capabilities(agent: PrinterAgent) -> str | None:
    raw = agent.capabilities_json
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(data, dict):
        return None
    for key in ("os", "operating_system", "platform"):
        val = data.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()[:64]
    return None


def _agent_summary_from_row(
    agent: PrinterAgent,
    *,
    last_ip: str | None,
) -> dict[str, Any]:
    status = agent_health_status(agent)
    created_at = getattr(agent, "created_at", None)
    online = is_agent_online(agent)
    uptime_seconds: int | None = None
    if created_at is not None and online:
        try:
            uptime_seconds = max(0, int((datetime.utcnow() - created_at).total_seconds()))
        except Exception:
            uptime_seconds = None
    return {
        "id": agent.id,
        "computer_name": agent.name,
        "machine_id": agent.machine_id,
        "os": _parse_os_from_capabilities(agent),
        "agent_version": agent.version,
        "last_ip": last_ip,
        "last_seen_at": agent.last_seen_at,
        "created_at": created_at,
        "uptime_seconds": uptime_seconds,
        "is_online": online,
        "status": status,
    }


def build_agent_summary(db: Session, workstation: WmsWorkstation) -> dict[str, Any] | None:
    if workstation.printer_agent_id is None:
        return None
    agent = (
        db.query(PrinterAgent).filter(PrinterAgent.id == workstation.printer_agent_id).first()
    )
    if agent is None:
        return None
    last_ip = None
    if workstation.integration_api_key_id is not None:
        key = (
            db.query(IntegrationApiKey)
            .filter(IntegrationApiKey.id == workstation.integration_api_key_id)
            .first()
        )
        last_ip = key.last_used_ip if key else None
    return _agent_summary_from_row(agent, last_ip=last_ip)


def device_count_for_agent(db: Session, agent_id: int | None) -> int:
    if agent_id is None:
        return 0
    counts = _device_counts_batch(db, {int(agent_id)})
    return int(counts.get(int(agent_id), 0))


def _device_counts_batch(db: Session, agent_ids: set[int]) -> dict[int, int]:
    """
    Count devices the same way DevicesTab shows them:
    active AgentPrinters + active EdgeDevices that are NOT already linked via legacy_printer_id.
    """
    if not agent_ids:
        return {}
    counts: dict[int, int] = defaultdict(int)
    printer_rows = (
        db.query(AgentPrinter.agent_id, AgentPrinter.id)
        .filter(AgentPrinter.agent_id.in_(agent_ids), AgentPrinter.is_active.is_(True))
        .all()
    )
    for agent_id, _pid in printer_rows:
        counts[int(agent_id)] += 1
    try:
        from ...models.agent.edge_device import EdgeDevice

        edge_rows = (
            db.query(EdgeDevice.agent_id, EdgeDevice.id, EdgeDevice.legacy_printer_id)
            .filter(EdgeDevice.agent_id.in_(agent_ids), EdgeDevice.is_active.is_(True))
            .all()
        )
        for agent_id, _eid, legacy_printer_id in edge_rows:
            if legacy_printer_id:
                continue  # already counted as AgentPrinter
            counts[int(agent_id)] += 1
    except Exception:
        pass
    return dict(counts)


def connection_status_from_summary(summary: dict[str, Any] | None) -> str:
    if summary is None:
        return "unpaired"
    if summary.get("status") == "online":
        return "connected"
    return "offline"


def serialize_workstation(
    db: Session,
    workstation: WmsWorkstation,
    *,
    detail: bool = False,
) -> dict[str, Any]:
    """Single-row serialize (detail / mutations). Prefer serialize_workstations_batch for lists."""
    return serialize_workstations_batch(db, [workstation], detail=detail)[0]


def serialize_workstations_batch(
    db: Session,
    workstations: list[WmsWorkstation],
    *,
    detail: bool = False,
) -> list[dict[str, Any]]:
    """Batch-serialize to avoid N+1 on list endpoints."""
    if not workstations:
        return []

    warehouse_ids = {int(w.warehouse_id) for w in workstations if w.warehouse_id is not None}
    agent_ids = {int(w.printer_agent_id) for w in workstations if w.printer_agent_id is not None}
    key_ids = {
        int(w.integration_api_key_id) for w in workstations if w.integration_api_key_id is not None
    }

    wh_names = _warehouse_names_batch(db, warehouse_ids)

    agents_by_id: dict[int, PrinterAgent] = {}
    if agent_ids:
        for agent in db.query(PrinterAgent).filter(PrinterAgent.id.in_(agent_ids)).all():
            agents_by_id[int(agent.id)] = agent

    ip_by_key: dict[int, str | None] = {}
    if key_ids:
        for key in db.query(IntegrationApiKey).filter(IntegrationApiKey.id.in_(key_ids)).all():
            ip_by_key[int(key.id)] = key.last_used_ip

    device_counts = _device_counts_batch(db, agent_ids)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    payloads: list[dict[str, Any]] = []

    for workstation in workstations:
        agent_summary = None
        if workstation.printer_agent_id is not None:
            agent = agents_by_id.get(int(workstation.printer_agent_id))
            if agent is not None:
                last_ip = None
                if workstation.integration_api_key_id is not None:
                    last_ip = ip_by_key.get(int(workstation.integration_api_key_id))
                agent_summary = _agent_summary_from_row(agent, last_ip=last_ip)

        station_type = workstation.station_type or STATION_TYPE_OTHER
        payload: dict[str, Any] = {
            "id": workstation.id,
            "name": workstation.name,
            "station_type": station_type,
            "station_type_label": STATION_TYPE_LABELS_PL.get(station_type, station_type),
            "warehouse_id": workstation.warehouse_id,
            "warehouse_name": wh_names.get(int(workstation.warehouse_id))
            if workstation.warehouse_id is not None
            else None,
            "description": workstation.description,
            "is_default": bool(workstation.is_default),
            "is_active": bool(workstation.is_active),
            "connection_status": connection_status_from_summary(agent_summary),
            "computer_name": agent_summary["computer_name"] if agent_summary else None,
            "device_count": device_counts.get(int(workstation.printer_agent_id), 0)
            if workstation.printer_agent_id is not None
            else 0,
            "last_sync_at": agent_summary["last_seen_at"] if agent_summary else None,
            "agent": agent_summary,
        }
        if detail:
            exp = workstation.pairing_expires_at
            pairing_active = bool(
                workstation.pairing_code_hash and exp is not None and exp > now
            )
            payload["pairing_active"] = pairing_active
            if pairing_active and exp is not None:
                # Always expose UTC with Z so FE TTL matches server.
                aware = exp.replace(tzinfo=timezone.utc) if exp.tzinfo is None else exp
                payload["pairing_expires_at"] = aware
            else:
                payload["pairing_expires_at"] = None
        payloads.append(payload)
    return payloads


def append_event(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
    event_type: str,
    title: str,
    detail: str | None = None,
    actor_user_id: int | None = None,
) -> WorkstationEvent:
    event = WorkstationEvent(
        tenant_id=tenant_id,
        workstation_id=workstation_id,
        event_type=event_type,
        title=title,
        detail=detail,
        actor_user_id=actor_user_id,
    )
    db.add(event)
    db.flush()
    return event
