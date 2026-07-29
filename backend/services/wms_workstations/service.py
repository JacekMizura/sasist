"""WMS workstation CRUD, pairing, devices, and printer mapping."""

from __future__ import annotations

import hashlib
import logging
import re
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from ...models.integration_api_key import IntegrationApiKey
from ...models.printing.agent_printer import AgentPrinter
from ...models.printing.printer_agent import PrinterAgent
from ...models.wms_workstations import (
    EVENT_COMPUTER_CONNECTED,
    EVENT_COMPUTER_DISCONNECTED,
    EVENT_CREATED,
    EVENT_PAIRING_CODE_ISSUED,
    EVENT_PRINTER_MAPPING_CHANGED,
    EVENT_UPDATED,
    PAIRING_CODE_PATTERN,
    PAIRING_CODE_TTL_MINUTES,
    PRINT_TYPE_LABELS_PL,
    PRINT_TYPES,
    STATION_TYPES,
    WmsWorkstation,
    WorkstationEvent,
    WorkstationPrinterMapping,
)
from ...models.wms_workstations.constants import STATION_TYPE_OTHER
from ...services.api_keys.api_key_service import (
    WORKSTATION_SYSTEM_KEY_DESCRIPTION,
    create_key,
    regenerate_key,
    revoke_key,
)
from ...services.api_keys.rate_limit import check_pairing_rate_limit
from ...services.audit_service import log_audit_entry
from ...services.printing.agent_service import is_agent_online
from ...services.tenant_default_warehouse import assert_tenant_warehouse_scope
from .errors import WorkstationError, WorkstationNotFoundError
from .serialize import append_event, serialize_workstation, serialize_workstations_batch

logger = logging.getLogger(__name__)

_PAIRING_RE = re.compile(PAIRING_CODE_PATTERN)
_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def hash_pairing_code(code: str) -> str:
    normalized = code.strip().upper().replace(" ", "")
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


def looks_like_pairing_code(value: str) -> bool:
    normalized = value.strip().upper().replace(" ", "")
    return bool(_PAIRING_RE.match(normalized))


def generate_pairing_code() -> str:
    parts = []
    for _ in range(3):
        parts.append("".join(secrets.choice(_CODE_ALPHABET) for _ in range(4)))
    return "-".join(parts)


def get_workstation_or_404(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
) -> WmsWorkstation:
    row = (
        db.query(WmsWorkstation)
        .filter(WmsWorkstation.id == workstation_id, WmsWorkstation.tenant_id == tenant_id)
        .first()
    )
    if row is None:
        raise WorkstationNotFoundError()
    return row


def _validate_station_type(station_type: str) -> str:
    normalized = (station_type or "").strip().lower() or STATION_TYPE_OTHER
    if normalized not in STATION_TYPES:
        raise WorkstationError(f"Nieznany typ stanowiska: {station_type}")
    return normalized


def _unset_defaults(db: Session, *, tenant_id: int, warehouse_id: int, except_id: int | None) -> None:
    rows = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.tenant_id == tenant_id,
            WmsWorkstation.warehouse_id == warehouse_id,
            WmsWorkstation.is_default.is_(True),
        )
        .all()
    )
    for row in rows:
        if except_id is not None and row.id == except_id:
            continue
        row.is_default = False


def list_workstations(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[dict[str, Any]]:
    if warehouse_id is not None:
        assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    q = db.query(WmsWorkstation).filter(WmsWorkstation.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(WmsWorkstation.warehouse_id == warehouse_id)
    rows = q.order_by(WmsWorkstation.name.asc(), WmsWorkstation.id.asc()).all()
    return serialize_workstations_batch(db, rows)


def create_workstation(
    db: Session,
    *,
    tenant_id: int,
    name: str,
    warehouse_id: int,
    station_type: str = STATION_TYPE_OTHER,
    description: str | None = None,
    is_default: bool = False,
    is_active: bool = True,
    actor_user_id: int | None = None,
) -> dict[str, Any]:
    assert_tenant_warehouse_scope(db, tenant_id, warehouse_id)
    st = _validate_station_type(station_type)
    if is_default:
        _unset_defaults(db, tenant_id=tenant_id, warehouse_id=warehouse_id, except_id=None)
    row = WmsWorkstation(
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        name=name.strip(),
        station_type=st,
        description=(description or "").strip() or None,
        is_default=bool(is_default),
        is_active=bool(is_active),
    )
    db.add(row)
    db.flush()
    append_event(
        db,
        tenant_id=tenant_id,
        workstation_id=row.id,
        event_type=EVENT_CREATED,
        title="Utworzono stanowisko",
        detail=row.name,
        actor_user_id=actor_user_id,
    )
    logger.info(
        "workstation.created tenant_id=%s workstation_id=%s warehouse_id=%s",
        tenant_id,
        row.id,
        warehouse_id,
    )
    return serialize_workstation(db, row, detail=True)


def update_workstation(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
    patch: dict[str, Any],
    actor_user_id: int | None = None,
) -> dict[str, Any]:
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    changes: list[str] = []

    if "name" in patch and patch["name"] is not None:
        new_name = str(patch["name"]).strip()
        if new_name and new_name != row.name:
            changes.append(f"Nazwa → {new_name}")
            row.name = new_name
    if "station_type" in patch and patch["station_type"] is not None:
        st = _validate_station_type(str(patch["station_type"]))
        if st != row.station_type:
            changes.append(f"Typ → {st}")
            row.station_type = st
    if "description" in patch:
        desc = (patch["description"] or "").strip() or None
        if desc != row.description:
            changes.append("Zmieniono opis")
            row.description = desc
    if "warehouse_id" in patch and patch["warehouse_id"] is not None:
        wh = int(patch["warehouse_id"])
        if wh != row.warehouse_id:
            assert_tenant_warehouse_scope(db, tenant_id, wh)
            changes.append(f"Magazyn → #{wh}")
            row.warehouse_id = wh
    if "is_active" in patch and patch["is_active"] is not None:
        row.is_active = bool(patch["is_active"])
        changes.append("Aktywne" if row.is_active else "Nieaktywne")
    if "is_default" in patch and patch["is_default"] is not None:
        want_default = bool(patch["is_default"])
        if want_default:
            _unset_defaults(
                db,
                tenant_id=tenant_id,
                warehouse_id=row.warehouse_id,
                except_id=row.id,
            )
        row.is_default = want_default
        changes.append("Domyślne dla magazynu" if want_default else "Bez domyślnego")

    row.updated_at = datetime.utcnow()
    if changes:
        append_event(
            db,
            tenant_id=tenant_id,
            workstation_id=row.id,
            event_type=EVENT_UPDATED,
            title="Zmieniono konfigurację stanowiska",
            detail="; ".join(changes),
            actor_user_id=actor_user_id,
        )
    return serialize_workstation(db, row, detail=True)


def delete_workstation(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
) -> None:
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    if row.integration_api_key_id is not None:
        revoke_key(
            db,
            tenant_id=tenant_id,
            key_id=int(row.integration_api_key_id),
            user_id=None,
            allow_workstation_managed=True,
        )
        row.integration_api_key_id = None
    db.delete(row)


def _clear_agent_for_repair(
    db: Session,
    *,
    row: WmsWorkstation,
    actor_user_id: int | None,
) -> None:
    """Detach current computer before issuing a fresh pairing code (H6)."""
    if row.printer_agent_id is None:
        return
    computer = None
    agent = db.query(PrinterAgent).filter(PrinterAgent.id == row.printer_agent_id).first()
    if agent is not None:
        computer = agent.name
    row.printer_agent_id = None
    db.query(WorkstationPrinterMapping).filter(
        WorkstationPrinterMapping.workstation_id == row.id
    ).delete(synchronize_session=False)
    append_event(
        db,
        tenant_id=int(row.tenant_id),
        workstation_id=row.id,
        event_type=EVENT_COMPUTER_DISCONNECTED,
        title="Rozłączono komputer",
        detail=computer or "Przed nowym kodem połączenia",
        actor_user_id=actor_user_id,
    )


def issue_pairing_code(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
    actor_user_id: int | None = None,
) -> dict[str, Any]:
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    if not row.is_active:
        raise WorkstationError("Stanowisko jest nieaktywne")

    assert_tenant_warehouse_scope(db, tenant_id, int(row.warehouse_id))

    # Re-pair: detach previous computer so pairing_active / UI status stay consistent.
    _clear_agent_for_repair(db, row=row, actor_user_id=actor_user_id)

    # Mint / rotate internal printer_agent key (never returned to UI).
    if row.integration_api_key_id is None:
        key_row, _plain = create_key(
            db,
            tenant_id=tenant_id,
            name=f"Stanowisko — {row.name}",
            key_type="printer_agent",
            warehouse_id=row.warehouse_id,
            created_by=actor_user_id,
            description=WORKSTATION_SYSTEM_KEY_DESCRIPTION,
        )
        row.integration_api_key_id = key_row.id
    else:
        regenerate_key(
            db,
            tenant_id=tenant_id,
            key_id=int(row.integration_api_key_id),
            user_id=actor_user_id,
            allow_workstation_managed=True,
        )

    plain_code = generate_pairing_code()
    row.pairing_code_hash = hash_pairing_code(plain_code)
    # Store naive UTC (DB column); API response uses aware UTC so FE never mis-parses local time.
    expires_naive_utc = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(
        minutes=PAIRING_CODE_TTL_MINUTES
    )
    row.pairing_expires_at = expires_naive_utc
    expires_aware = expires_naive_utc.replace(tzinfo=timezone.utc)

    append_event(
        db,
        tenant_id=tenant_id,
        workstation_id=row.id,
        event_type=EVENT_PAIRING_CODE_ISSUED,
        title="Wygenerowano kod połączenia",
        detail=f"Ważny {PAIRING_CODE_TTL_MINUTES} min",
        actor_user_id=actor_user_id,
    )
    log_audit_entry(
        db,
        user_id=actor_user_id,
        action="wms_workstation.pairing_issued",
        entity_type="wms_workstation",
        entity_id=row.id,
        detail={
            "warehouse_id": row.warehouse_id,
            "expires_at": expires_aware.isoformat(),
        },
    )
    logger.info(
        "workstation.pairing_issued tenant_id=%s workstation_id=%s expires_at=%s code_len=%s",
        tenant_id,
        row.id,
        expires_aware.isoformat(),
        len(plain_code),
    )
    return {
        "pairing_code": plain_code,
        "expires_at": expires_aware,
        "message": "Wklej kod połączenia w Sasist Agent na komputerze przy tym stanowisku.",
    }


def claim_pairing_code(
    db: Session,
    pairing_code: str,
    *,
    client_ip: str | None = None,
) -> tuple[IntegrationApiKey, WmsWorkstation]:
    """
    Atomically consume a pairing code (single-use).
    Clears hash before register to block replay / concurrent claim races.
    """
    check_pairing_rate_limit(client_ip=client_ip)
    if not looks_like_pairing_code(pairing_code):
        log_audit_entry(
            db,
            user_id=None,
            action="wms_workstation.pairing_claim_failed",
            entity_type="wms_workstation",
            entity_id=None,
            detail={"reason": "invalid_format", "client_ip": client_ip},
        )
        raise WorkstationError("Nieprawidłowy kod połączenia", status_code=401)

    code_hash = hash_pairing_code(pairing_code)
    now = datetime.utcnow()
    row = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.pairing_code_hash == code_hash,
            WmsWorkstation.pairing_expires_at.isnot(None),
            WmsWorkstation.pairing_expires_at > now,
        )
        .first()
    )
    if row is None:
        log_audit_entry(
            db,
            user_id=None,
            action="wms_workstation.pairing_claim_failed",
            entity_type="wms_workstation",
            entity_id=None,
            detail={"reason": "not_found_or_expired", "client_ip": client_ip},
        )
        raise WorkstationError("Kod połączenia jest nieprawidłowy lub wygasł", status_code=401)

    # Compare-and-set: only one concurrent claim wins.
    cleared = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.id == row.id,
            WmsWorkstation.pairing_code_hash == code_hash,
        )
        .update(
            {
                WmsWorkstation.pairing_code_hash: None,
                WmsWorkstation.pairing_expires_at: None,
            },
            synchronize_session="fetch",
        )
    )
    if cleared != 1:
        log_audit_entry(
            db,
            user_id=None,
            action="wms_workstation.pairing_claim_failed",
            entity_type="wms_workstation",
            entity_id=row.id,
            detail={"reason": "already_claimed", "client_ip": client_ip},
        )
        raise WorkstationError("Kod połączenia został już wykorzystany", status_code=401)

    db.refresh(row)
    if row.integration_api_key_id is None:
        raise WorkstationError("Stanowisko nie ma aktywnego kodu połączenia", status_code=401)
    key = (
        db.query(IntegrationApiKey)
        .filter(IntegrationApiKey.id == row.integration_api_key_id)
        .first()
    )
    if key is None or not key.is_active or key.revoked_at is not None:
        raise WorkstationError("Kod połączenia jest nieaktywny", status_code=401)
    if key.type != "printer_agent":
        raise WorkstationError("Kod połączenia jest nieaktywny", status_code=401)
    if key.expires_at is not None and key.expires_at <= now:
        raise WorkstationError("Kod połączenia wygasł", status_code=401)
    if int(key.tenant_id) != int(row.tenant_id):
        raise WorkstationError("Kod połączenia jest nieaktywny", status_code=401)
    if key.warehouse_id is not None and int(key.warehouse_id) != int(row.warehouse_id):
        raise WorkstationError("Kod połączenia jest nieaktywny", status_code=401)

    log_audit_entry(
        db,
        user_id=None,
        action="wms_workstation.pairing_claimed",
        entity_type="wms_workstation",
        entity_id=row.id,
        detail={
            "warehouse_id": row.warehouse_id,
            "api_key_id": key.id,
            "client_ip": client_ip,
        },
    )
    logger.info(
        "workstation.pairing_claim_ok workstation_id=%s api_key_id=%s tenant_id=%s",
        row.id,
        key.id,
        row.tenant_id,
    )
    return key, row


def attach_agent_to_workstation(
    db: Session,
    *,
    workstation: WmsWorkstation,
    agent: PrinterAgent,
    api_key: IntegrationApiKey | None = None,
) -> None:
    if int(agent.tenant_id) != int(workstation.tenant_id):
        raise WorkstationError(
            "Agent należy do innego tenanta niż stanowisko",
            status_code=403,
        )
    if api_key is not None:
        if int(api_key.tenant_id) != int(workstation.tenant_id):
            raise WorkstationError("Niespójny klucz parowania (tenant)", status_code=403)
        if api_key.warehouse_id is not None and int(api_key.warehouse_id) != int(
            workstation.warehouse_id
        ):
            raise WorkstationError("Niespójny klucz parowania (magazyn)", status_code=403)

    # One agent → max one workstation.
    conflict = (
        db.query(WmsWorkstation)
        .filter(
            WmsWorkstation.printer_agent_id == agent.id,
            WmsWorkstation.id != workstation.id,
            WmsWorkstation.tenant_id == workstation.tenant_id,
        )
        .first()
    )
    if conflict is not None:
        conflict.printer_agent_id = None
        append_event(
            db,
            tenant_id=int(conflict.tenant_id),
            workstation_id=conflict.id,
            event_type=EVENT_COMPUTER_DISCONNECTED,
            title="Rozłączono komputer",
            detail=f"Komputer przeniesiony na stanowisko {workstation.name}",
        )

    workstation.printer_agent_id = agent.id
    if api_key is not None:
        workstation.integration_api_key_id = api_key.id
    workstation.pairing_code_hash = None
    workstation.pairing_expires_at = None
    # Always bind agent to the workstation warehouse (tenant/warehouse scope).
    agent.warehouse_id = workstation.warehouse_id

    append_event(
        db,
        tenant_id=int(workstation.tenant_id),
        workstation_id=workstation.id,
        event_type=EVENT_COMPUTER_CONNECTED,
        title="Połączono komputer",
        detail=f"{agent.name} · Agent {agent.version or '—'}",
    )


def try_attach_agent_after_register(
    db: Session,
    *,
    api_key: IntegrationApiKey,
    agent: PrinterAgent,
) -> WmsWorkstation | None:
    """Link agent to workstation that owns this internal pairing key."""
    ws = (
        db.query(WmsWorkstation)
        .filter(WmsWorkstation.integration_api_key_id == api_key.id)
        .first()
    )
    if ws is None:
        return None
    if int(ws.tenant_id) != int(agent.tenant_id):
        raise WorkstationError(
            "Agent należy do innego tenanta niż stanowisko",
            status_code=403,
        )
    attach_agent_to_workstation(db, workstation=ws, agent=agent, api_key=api_key)
    return ws


def disconnect_computer(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
    actor_user_id: int | None = None,
) -> dict[str, Any]:
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    computer = None
    if row.printer_agent_id is not None:
        agent = db.query(PrinterAgent).filter(PrinterAgent.id == row.printer_agent_id).first()
        computer = agent.name if agent else f"#{row.printer_agent_id}"
    row.printer_agent_id = None
    row.pairing_code_hash = None
    row.pairing_expires_at = None
    if row.integration_api_key_id is not None:
        revoke_key(
            db,
            tenant_id=tenant_id,
            key_id=int(row.integration_api_key_id),
            user_id=actor_user_id,
            allow_workstation_managed=True,
        )
        row.integration_api_key_id = None
    # Clear printer mappings (printers belonged to previous agent).
    db.query(WorkstationPrinterMapping).filter(
        WorkstationPrinterMapping.workstation_id == row.id
    ).delete(synchronize_session=False)
    append_event(
        db,
        tenant_id=tenant_id,
        workstation_id=row.id,
        event_type=EVENT_COMPUTER_DISCONNECTED,
        title="Rozłączono komputer",
        detail=computer,
        actor_user_id=actor_user_id,
    )
    return serialize_workstation(db, row, detail=True)


def list_devices_grouped(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
) -> dict[str, list[dict[str, Any]]]:
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    empty: dict[str, list[dict[str, Any]]] = {
        "printers": [],
        "scanners": [],
        "scales": [],
        "cameras": [],
        "rfid": [],
        "barcode_readers": [],
        "other": [],
    }
    if row.printer_agent_id is None:
        return empty

    printers = (
        db.query(AgentPrinter)
        .filter(
            AgentPrinter.agent_id == row.printer_agent_id,
            AgentPrinter.is_active.is_(True),
        )
        .order_by(AgentPrinter.name.asc())
        .all()
    )
    agent = db.query(PrinterAgent).filter(PrinterAgent.id == row.printer_agent_id).first()
    online = is_agent_online(agent) if agent else False
    for p in printers:
        empty["printers"].append(
            {
                "id": p.id,
                "name": p.name or p.system_name,
                "device_kind": "printer",
                "status": "online" if online else "offline",
                "last_seen_at": agent.last_seen_at if agent else None,
                "agent_printer_id": p.id,
                "detail": p.system_name,
            }
        )

    try:
        from ...models.agent.edge_device import EdgeDevice

        edges = (
            db.query(EdgeDevice)
            .filter(
                EdgeDevice.agent_id == row.printer_agent_id,
                EdgeDevice.is_active.is_(True),
            )
            .order_by(EdgeDevice.display_name.asc())
            .all()
        )
        kind_map = {
            "printer": "printers",
            "scanner": "scanners",
            "scale": "scales",
            "camera": "cameras",
            "rfid": "rfid",
            "barcode_reader": "barcode_readers",
            "barcode": "barcode_readers",
        }
        for d in edges:
            if d.legacy_printer_id:
                continue  # already listed via agent_printers
            bucket = kind_map.get((d.device_type or "").lower(), "other")
            empty[bucket].append(
                {
                    "id": d.id,
                    "name": d.display_name,
                    "device_kind": d.device_type,
                    "status": d.status or ("online" if online else "offline"),
                    "last_seen_at": d.last_seen_at or (agent.last_seen_at if agent else None),
                    "agent_printer_id": d.legacy_printer_id,
                    "detail": d.model,
                }
            )
    except Exception:
        pass
    return empty


def get_printers_config(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
) -> dict[str, Any]:
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    available: list[dict[str, Any]] = []
    agent = None
    online = False
    if row.printer_agent_id is not None:
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
        m.print_type: m
        for m in db.query(WorkstationPrinterMapping)
        .filter(WorkstationPrinterMapping.workstation_id == row.id)
        .all()
    }
    mappings: list[dict[str, Any]] = []
    printer_by_id = {p["id"]: p for p in available}
    for print_type in PRINT_TYPES:
        m = existing.get(print_type)
        printer_id = m.agent_printer_id if m else None
        printer = printer_by_id.get(printer_id) if printer_id else None
        mappings.append(
            {
                "print_type": print_type,
                "print_type_label": PRINT_TYPE_LABELS_PL.get(print_type, print_type),
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
    row = get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    if row.printer_agent_id is None:
        raise WorkstationError("Najpierw połącz komputer ze stanowiskiem")

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
        print_type = str(item.get("print_type") or "").strip()
        if print_type not in PRINT_TYPES:
            raise WorkstationError(f"Nieznany typ wydruku: {print_type}")
        raw_id = item.get("agent_printer_id")
        existing = (
            db.query(WorkstationPrinterMapping)
            .filter(
                WorkstationPrinterMapping.workstation_id == row.id,
                WorkstationPrinterMapping.print_type == print_type,
            )
            .first()
        )
        label = PRINT_TYPE_LABELS_PL.get(print_type, print_type)
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
                    print_type=print_type,
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


def list_history(
    db: Session,
    *,
    tenant_id: int,
    workstation_id: int,
    limit: int = 100,
    offset: int = 0,
) -> list[dict[str, Any]]:
    get_workstation_or_404(db, tenant_id=tenant_id, workstation_id=workstation_id)
    safe_limit = max(1, min(int(limit), 500))
    safe_offset = max(0, int(offset))
    rows = (
        db.query(WorkstationEvent)
        .filter(
            WorkstationEvent.tenant_id == tenant_id,
            WorkstationEvent.workstation_id == workstation_id,
        )
        .order_by(WorkstationEvent.created_at.desc(), WorkstationEvent.id.desc())
        .offset(safe_offset)
        .limit(safe_limit)
        .all()
    )
    return [
        {
            "id": e.id,
            "event_type": e.event_type,
            "title": e.title,
            "detail": e.detail,
            "created_at": e.created_at,
        }
        for e in rows
    ]
