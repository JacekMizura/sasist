"""Full Edge Device Registry — persistence, delta sync, actions, events.

Type-agnostic: no switch(device_type) business logic.
"""

from __future__ import annotations

import json
import secrets
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.agent.edge_device import EdgeDevice, EdgeDeviceAction, EdgeDeviceEvent
from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.constants import (
    PRINTER_TYPE_A4,
    PRINTER_TYPE_LABEL,
    PRINTER_TYPE_OTHER,
    PRINTER_TYPE_RECEIPT,
)
from ...models.printing.printer_agent import PrinterAgent
from ...schemas.agent.devices import (
    ActionResultRequest,
    CapabilityDescriptorRead,
    CreateActionRequest,
    DeviceConfigurationRead,
    DeviceHealthRead,
    DeviceSyncRequest,
    DeviceSyncResponse,
    EdgeDeviceActionRead,
    EdgeDeviceEventRead,
    EdgeDeviceRead,
    EdgeDeviceUpsert,
    EdgeModuleRead,
    PendingActionOut,
    UpdateDeviceConfigurationRequest,
)
from ...services.printing.agent_service import list_agents
from ...services.printing.assignment_service import agent_printer_status_fields
from ...services.printing.printer_service import list_agent_printers


def _dumps(obj: Any) -> str | None:
    if obj is None:
        return None
    return json.dumps(obj, default=str, ensure_ascii=False)


def _loads(raw: str | None, default: Any = None) -> Any:
    if not raw:
        return default
    try:
        return json.loads(raw)
    except (TypeError, ValueError, json.JSONDecodeError):
        return default


def _infer_legacy_printer_type(name: str) -> str:
    n = (name or "").lower()
    if any(x in n for x in ("zebra", "zdesigner", "godex", "tsc", "label", "etykiet")):
        return PRINTER_TYPE_LABEL
    if any(x in n for x in ("receipt", "pos-", "tm-", "fiskal")):
        return PRINTER_TYPE_RECEIPT
    if any(x in n for x in ("pdf", "microsoft", "xps", "onenote", "fax")):
        return PRINTER_TYPE_A4
    return PRINTER_TYPE_OTHER


def link_edge_printer_to_agent_printer(db: Session, agent: PrinterAgent, edge: EdgeDevice) -> AgentPrinter | None:
    """Keep agent_printers in sync with edge printer devices (print-job / mapping SSOT)."""
    if (edge.device_type or "").lower() != "printer":
        return None
    system_name = (edge.local_id or edge.display_name or "").strip()
    if not system_name:
        return None
    display = (edge.display_name or system_name).strip()

    printer: AgentPrinter | None = None
    if edge.legacy_printer_id is not None:
        printer = (
            db.query(AgentPrinter)
            .filter(
                AgentPrinter.id == edge.legacy_printer_id,
                AgentPrinter.agent_id == agent.id,
            )
            .first()
        )
    if printer is None:
        printer = (
            db.query(AgentPrinter)
            .filter(
                AgentPrinter.agent_id == agent.id,
                AgentPrinter.system_name == system_name,
            )
            .first()
        )
    if printer is None:
        printer = AgentPrinter(
            agent_id=agent.id,
            name=display[:120],
            system_name=system_name[:255],
            printer_type=_infer_legacy_printer_type(display),
            is_default=bool(edge.is_default),
            is_active=bool(edge.is_active),
        )
        db.add(printer)
        db.flush()
    else:
        printer.name = display[:120]
        printer.is_active = bool(edge.is_active)
        if edge.is_default:
            printer.is_default = True

    if edge.legacy_printer_id != printer.id:
        edge.legacy_printer_id = printer.id
    return printer


def ensure_agent_printers_from_edge_devices(db: Session, *, agent_id: int) -> int:
    """Self-heal: materialize AgentPrinter rows for edge printers missing legacy_printer_id."""
    agent = db.query(PrinterAgent).filter(PrinterAgent.id == agent_id).first()
    if agent is None:
        return 0
    edges = (
        db.query(EdgeDevice)
        .filter(
            EdgeDevice.agent_id == agent_id,
            EdgeDevice.is_active.is_(True),
            EdgeDevice.device_type == "printer",
        )
        .all()
    )
    linked = 0
    for edge in edges:
        if link_edge_printer_to_agent_printer(db, agent, edge) is not None:
            linked += 1
    if linked:
        db.flush()
    return linked


def serialize_edge_device(row: EdgeDevice) -> EdgeDeviceRead:
    caps_raw = _loads(row.capabilities_json, [])
    caps: list[CapabilityDescriptorRead] = []
    if isinstance(caps_raw, list):
        for item in caps_raw:
            if isinstance(item, dict):
                caps.append(
                    CapabilityDescriptorRead(
                        name=str(item.get("name") or "Capability"),
                        version=str(item.get("version") or "1"),
                        supported_operations=list(item.get("supported_operations") or []),
                        limits=item.get("limits"),
                    )
                )
            elif isinstance(item, str):
                caps.append(CapabilityDescriptorRead(name=item, version="1", supported_operations=[item]))

    cfg_values = _loads(row.configuration_json, {}) or {}
    health_raw = _loads(row.health_json, {}) or {}
    health = None
    if row.health_score is not None or health_raw:
        health = DeviceHealthRead(
            health_score=row.health_score if row.health_score is not None else health_raw.get("health_score", 50),
            warnings=list(health_raw.get("warnings") or []),
            errors=list(health_raw.get("errors") or []),
            recommended_actions=list(health_raw.get("recommended_actions") or []),
        )

    configuration = None
    if row.configuration_json or row.configuration_version:
        configuration = DeviceConfigurationRead(
            values=cfg_values if isinstance(cfg_values, dict) else {},
            configuration_version=row.configuration_version or "0",
            updated_at=row.updated_at,
        )

    return EdgeDeviceRead(
        id=row.local_id,
        type=row.device_type,
        manufacturer=row.manufacturer,
        model=row.model,
        serial_number=row.serial_number,
        driver=row.driver,
        firmware=row.firmware,
        status=row.status or "unknown",
        capabilities=caps,
        last_seen=row.last_seen_at,
        metadata=_loads(row.metadata_json, {}) or {},
        agent_id=row.agent_id,
        module_id=row.module_id,
        display_name=row.display_name,
        is_active=bool(row.is_active),
        is_default=bool(row.is_default),
        configuration=configuration,
        health=health,
        configuration_version=row.configuration_version,
        sync_revision=row.sync_revision,
        legacy_printer_id=row.legacy_printer_id,
        registry_id=row.id,
    )


def _project_legacy_printer(row: Any) -> EdgeDeviceRead:
    agent = row.agent
    status_fields = agent_printer_status_fields(agent) if agent else {}
    online = bool(status_fields.get("agent_is_online"))
    return EdgeDeviceRead(
        id=str(row.system_name or row.id),
        type="printer",
        model=row.name,
        status="online" if online else "offline",
        capabilities=[
            CapabilityDescriptorRead(
                name="Printer",
                version="1",
                supported_operations=["print_pdf"],
            )
        ],
        last_seen=getattr(agent, "last_seen_at", None) if agent else None,
        metadata={
            "system_name": row.system_name,
            "printer_type": row.printer_type,
            "source": "agent_printers",
        },
        agent_id=row.agent_id,
        module_id="printing",
        display_name=row.name,
        is_active=bool(row.is_active),
        is_default=bool(row.is_default),
        health=DeviceHealthRead(health_score=100 if online else 0),
        legacy_printer_id=row.id,
        registry_id=None,
    )


def list_edge_devices(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    agent_id: int | None = None,
    device_type: str | None = None,
) -> list[EdgeDeviceRead]:
    q = db.query(EdgeDevice).filter(EdgeDevice.tenant_id == tenant_id)
    if agent_id is not None:
        q = q.filter(EdgeDevice.agent_id == agent_id)
    if device_type:
        q = q.filter(EdgeDevice.device_type == device_type.strip().lower())
    if warehouse_id is not None:
        q = q.join(PrinterAgent, PrinterAgent.id == EdgeDevice.agent_id).filter(
            PrinterAgent.warehouse_id == warehouse_id
        )
    rows = q.order_by(EdgeDevice.display_name.asc()).all()
    if rows:
        return [serialize_edge_device(r) for r in rows]

    legacy = list_agent_printers(
        db, tenant_id=tenant_id, warehouse_id=warehouse_id, agent_id=agent_id
    )
    devices = [_project_legacy_printer(r) for r in legacy]
    if device_type:
        want = device_type.strip().lower()
        devices = [d for d in devices if d.type == want]
    return devices


def get_edge_device(db: Session, *, tenant_id: int, device_id: str) -> EdgeDeviceRead | None:
    key = device_id.strip()
    q = db.query(EdgeDevice).filter(EdgeDevice.tenant_id == tenant_id)
    if key.isdigit():
        row = q.filter((EdgeDevice.id == int(key)) | (EdgeDevice.local_id == key)).first()
    else:
        row = q.filter(EdgeDevice.local_id == key).first()
    if row:
        return serialize_edge_device(row)
    for d in list_edge_devices(db, tenant_id=tenant_id):
        if d.id == key or (d.legacy_printer_id is not None and str(d.legacy_printer_id) == key):
            return d
    return None


def list_edge_modules(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[EdgeModuleRead]:
    agents = list_agents(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    modules: list[EdgeModuleRead] = []
    for a in agents:
        agent_id = int(a["id"])
        counts = db.query(EdgeDevice.module_id).filter(EdgeDevice.agent_id == agent_id).all()
        by_module: dict[str, int] = {}
        for (mid,) in counts:
            by_module[mid or "unknown"] = by_module.get(mid or "unknown", 0) + 1
        if not by_module:
            by_module["printing"] = int(a.get("printer_count") or 0)
        online = bool(a.get("is_online"))
        formats = list(a.get("supported_formats") or [])
        printer_module_ids = {
            mid
            for (mid,) in db.query(EdgeDevice.module_id)
            .filter(EdgeDevice.agent_id == agent_id, EdgeDevice.device_type == "printer")
            .distinct()
            .all()
        }
        for mid, count in by_module.items():
            caps = (
                [
                    f"print.{f}" if not str(f).startswith("print.") else str(f)
                    for f in formats
                ]
                if mid in printer_module_ids
                else []
            )
            modules.append(
                EdgeModuleRead(
                    id=mid,
                    agent_id=agent_id,
                    agent_name=a.get("name"),
                    machine_id=a.get("machine_id"),
                    state="running" if online else "stopped",
                    version=a.get("version"),
                    device_count=count,
                    capabilities=caps,
                    last_seen=a.get("last_seen_at"),
                    is_online=online,
                    last_error=a.get("last_error"),
                    metadata={"health_status": a.get("health_status"), "source": "edge_devices"},
                )
            )
    return modules


def _apply_upsert(db: Session, agent: PrinterAgent, item: EdgeDeviceUpsert) -> EdgeDevice:
    row = (
        db.query(EdgeDevice)
        .filter(
            EdgeDevice.agent_id == agent.id,
            EdgeDevice.module_id == item.module_id,
            EdgeDevice.local_id == item.id,
        )
        .first()
    )
    if row is None:
        row = EdgeDevice(
            tenant_id=agent.tenant_id,
            agent_id=agent.id,
            local_id=item.id,
            module_id=item.module_id,
            device_type=item.type,
            display_name=item.display_name or item.id,
        )
        db.add(row)

    row.device_type = item.type
    row.display_name = item.display_name or item.id
    row.manufacturer = item.manufacturer
    row.model = item.model
    row.serial_number = item.serial_number
    row.driver = item.driver
    row.firmware = item.firmware
    row.status = item.status or "unknown"
    row.capabilities_json = _dumps([c.model_dump() for c in item.capabilities])
    row.metadata_json = _dumps(item.metadata or {})
    row.is_active = bool(item.is_active)
    row.is_default = bool(item.is_default)
    row.last_seen_at = item.last_seen or datetime.utcnow()
    row.sync_revision = item.sync_revision

    if item.configuration is not None:
        row.configuration_json = _dumps(item.configuration.values)
        row.configuration_version = item.configuration.configuration_version

    if item.health is not None:
        row.health_score = float(item.health.health_score)
        row.health_json = _dumps(
            {
                "health_score": item.health.health_score,
                "warnings": item.health.warnings,
                "errors": item.health.errors,
                "recommended_actions": item.health.recommended_actions,
            }
        )
    if (row.device_type or "").lower() == "printer":
        link_edge_printer_to_agent_printer(db, agent, row)
    return row


def sync_devices_from_agent(
    db: Session,
    agent: PrinterAgent,
    payload: DeviceSyncRequest,
) -> DeviceSyncResponse:
    now = payload.heartbeat_at or datetime.utcnow()
    agent.last_seen_at = now
    agent.is_online = True

    for item in payload.upserts:
        _apply_upsert(db, agent, item)

    for local_id in payload.removes:
        rows = (
            db.query(EdgeDevice)
            .filter(EdgeDevice.agent_id == agent.id, EdgeDevice.local_id == local_id)
            .all()
        )
        for row in rows:
            if row.legacy_printer_id is not None:
                legacy = (
                    db.query(AgentPrinter)
                    .filter(
                        AgentPrinter.id == row.legacy_printer_id,
                        AgentPrinter.agent_id == agent.id,
                    )
                    .first()
                )
                if legacy is not None:
                    legacy.is_active = False
            db.delete(row)

    for evt in payload.events or []:
        device_pk = None
        if evt.device_id:
            found = (
                db.query(EdgeDevice)
                .filter(EdgeDevice.agent_id == agent.id, EdgeDevice.local_id == evt.device_id)
                .first()
            )
            if found:
                device_pk = found.id
        db.add(
            EdgeDeviceEvent(
                tenant_id=agent.tenant_id,
                agent_id=agent.id,
                device_id=device_pk,
                local_device_id=evt.device_id,
                event_type=evt.event_type,
                module_id=evt.module_id,
                device_type=evt.device_type,
                occurred_at=evt.occurred_at or now,
                payload_json=_dumps(evt.payload or {}),
            )
        )

    agent.printer_count = db.query(EdgeDevice).filter(EdgeDevice.agent_id == agent.id).count()
    db.flush()

    pending = (
        db.query(EdgeDeviceAction)
        .filter(EdgeDeviceAction.agent_id == agent.id, EdgeDeviceAction.status == "pending")
        .order_by(EdgeDeviceAction.id.asc())
        .limit(20)
        .all()
    )
    pending_out = [
        PendingActionOut(
            action=a.action,
            module_id=a.module_id,
            device_id=a.device_local_id,
            correlation_id=a.correlation_id,
            parameters=_loads(a.parameters_json, {}),
        )
        for a in pending
    ]
    for a in pending:
        a.status = "dispatched"

    return DeviceSyncResponse(
        server_cursor=secrets.token_hex(8),
        configuration_updates=[],
        pending_actions=pending_out,
    )


def enqueue_action(
    db: Session,
    *,
    tenant_id: int,
    payload: CreateActionRequest,
) -> EdgeDeviceActionRead:
    agent = (
        db.query(PrinterAgent)
        .filter(PrinterAgent.id == payload.agent_id, PrinterAgent.tenant_id == tenant_id)
        .first()
    )
    if agent is None:
        raise ValueError("Agent not found")

    correlation_id = uuid.uuid4().hex
    row = EdgeDeviceAction(
        tenant_id=tenant_id,
        agent_id=payload.agent_id,
        correlation_id=correlation_id,
        action=payload.action,
        module_id=payload.module_id,
        device_local_id=payload.device_id,
        parameters_json=_dumps(payload.parameters or {}),
        status="pending",
    )
    db.add(row)
    db.flush()

    if payload.action == "UpdateDeviceConfiguration" and payload.device_id and payload.parameters:
        values = (
            payload.parameters.get("values")
            or payload.parameters.get("configuration")
            or payload.parameters
        )
        version = str(payload.parameters.get("configuration_version") or uuid.uuid4().hex[:12])
        if isinstance(values, dict):
            update_device_configuration(
                db,
                tenant_id=tenant_id,
                device_id=payload.device_id,
                agent_id=payload.agent_id,
                payload=UpdateDeviceConfigurationRequest(
                    values=values, configuration_version=version
                ),
            )

    return _serialize_action(row)


def record_action_result(
    db: Session, agent: PrinterAgent, payload: ActionResultRequest
) -> EdgeDeviceActionRead:
    row = (
        db.query(EdgeDeviceAction)
        .filter(
            EdgeDeviceAction.agent_id == agent.id,
            EdgeDeviceAction.correlation_id == payload.correlation_id,
        )
        .first()
    )
    if row is None:
        raise ValueError("Action not found")
    row.status = "completed" if payload.completed else ("accepted" if payload.accepted else "failed")
    row.error_code = payload.error_code
    row.error_message = payload.error_message
    row.result_json = _dumps(payload.data)
    row.completed_at = datetime.utcnow()
    db.flush()
    return _serialize_action(row)


def update_device_configuration(
    db: Session,
    *,
    tenant_id: int,
    device_id: str,
    payload: UpdateDeviceConfigurationRequest,
    agent_id: int | None = None,
) -> EdgeDeviceRead:
    q = db.query(EdgeDevice).filter(EdgeDevice.tenant_id == tenant_id, EdgeDevice.local_id == device_id)
    if agent_id is not None:
        q = q.filter(EdgeDevice.agent_id == agent_id)
    row = q.first()
    if row is None:
        raise ValueError("Device not found")
    version = payload.configuration_version or uuid.uuid4().hex[:12]
    row.configuration_json = _dumps(payload.values)
    row.configuration_version = version
    db.flush()
    return serialize_edge_device(row)


def list_events(
    db: Session,
    *,
    tenant_id: int,
    agent_id: int | None = None,
    limit: int = 100,
) -> list[EdgeDeviceEventRead]:
    q = db.query(EdgeDeviceEvent).filter(EdgeDeviceEvent.tenant_id == tenant_id)
    if agent_id is not None:
        q = q.filter(EdgeDeviceEvent.agent_id == agent_id)
    rows = q.order_by(EdgeDeviceEvent.occurred_at.desc()).limit(min(500, max(1, limit))).all()
    return [
        EdgeDeviceEventRead(
            id=r.id,
            agent_id=r.agent_id,
            device_id=r.local_device_id,
            event_type=r.event_type,
            module_id=r.module_id,
            device_type=r.device_type,
            occurred_at=r.occurred_at,
            payload=_loads(r.payload_json, {}) or {},
        )
        for r in rows
    ]


def list_actions(
    db: Session,
    *,
    tenant_id: int,
    agent_id: int | None = None,
    limit: int = 50,
) -> list[EdgeDeviceActionRead]:
    q = db.query(EdgeDeviceAction).filter(EdgeDeviceAction.tenant_id == tenant_id)
    if agent_id is not None:
        q = q.filter(EdgeDeviceAction.agent_id == agent_id)
    rows = q.order_by(EdgeDeviceAction.id.desc()).limit(min(200, max(1, limit))).all()
    return [_serialize_action(r) for r in rows]


def _serialize_action(row: EdgeDeviceAction) -> EdgeDeviceActionRead:
    return EdgeDeviceActionRead(
        id=row.id,
        agent_id=row.agent_id,
        correlation_id=row.correlation_id,
        action=row.action,
        module_id=row.module_id,
        device_id=row.device_local_id,
        status=row.status,
        parameters=_loads(row.parameters_json, {}),
        result=_loads(row.result_json, None),
        error_code=row.error_code,
        error_message=row.error_message,
        created_at=row.created_at,
        completed_at=row.completed_at,
    )
