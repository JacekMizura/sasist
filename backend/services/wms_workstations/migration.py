"""Idempotent one-shot migration: printer agents → WMS workstations.

Never hijacks user-created empty workstations with orphan API keys.
Runs at most once per database (flag in wms_data_migrations).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from ...models.integration_api_key import IntegrationApiKey
from ...models.printing.printing_default import PrintingDefault
from ...models.printing.printer_agent import PrinterAgent
from ...models.wms_workstations import (
    EVENT_CREATED,
    LEGACY_PRINTER_TYPE_TO_PRINT_TYPE,
    STATION_TYPE_OTHER,
    WmsWorkstation,
    WorkstationPrinterMapping,
)
from .serialize import append_event

logger = logging.getLogger(__name__)

MIGRATION_KEY_AGENTS_TO_WORKSTATIONS = "agents_to_workstations_v1"
MIGRATION_KEY_PRINT_PROFILES_V1 = "print_profiles_v1"


def migrate_printer_mappings_to_profiles(db: Session, *, force: bool = False) -> dict[str, Any]:
    """Rewrite legacy print_type rows to print-profile codes; collapse DOCUMENTS dupes.

    Must delete colliding rows before renaming, because uq_wms_ws_printer_mapping_type
    is on (workstation_id, print_type).
    """
    from collections import defaultdict

    from ...printing_profiles import (
        PRINT_PROFILE_DOCUMENTS,
        documents_legacy_priority_index,
        normalize_print_profile,
    )

    try:
        already = is_migration_applied(db, MIGRATION_KEY_PRINT_PROFILES_V1)
    except Exception:
        already = False

    if already and not force:
        logger.info(
            "[wms_workstations.migrate] skip already_applied key=%s",
            MIGRATION_KEY_PRINT_PROFILES_V1,
        )
        return {"skipped": True, "updated": 0, "deleted": 0, "collapsed": 0}

    rows = db.query(WorkstationPrinterMapping).order_by(WorkstationPrinterMapping.id.asc()).all()
    updated = 0
    deleted = 0
    collapsed = 0

    by_ws: dict[int, list[WorkstationPrinterMapping]] = defaultdict(list)
    for row in rows:
        by_ws[int(row.workstation_id)].append(row)

    for _ws_id, group in by_ws.items():
        by_profile: dict[str, list[tuple[int, WorkstationPrinterMapping, str]]] = defaultdict(list)
        for row in group:
            raw = str(row.print_profile or "").strip()
            profile = normalize_print_profile(raw) or PRINT_PROFILE_DOCUMENTS
            prio = documents_legacy_priority_index(raw.lower())
            by_profile[profile].append((prio, row, raw))

        for profile, items in by_profile.items():
            items.sort(key=lambda t: (t[0], int(t[1].id)))
            _prio, keep, keep_raw = items[0]
            for _p, dup, _raw in items[1:]:
                db.delete(dup)
                deleted += 1
                collapsed += 1
            if keep_raw != profile:
                keep.print_profile = profile
                updated += 1

    result = {
        "skipped": False,
        "updated": updated,
        "deleted": deleted,
        "collapsed": collapsed,
    }
    mark_migration_applied(db, MIGRATION_KEY_PRINT_PROFILES_V1, detail=result)
    db.flush()
    logger.info(
        "[wms_workstations.migrate] applied key=%s updated=%s deleted=%s",
        MIGRATION_KEY_PRINT_PROFILES_V1,
        updated,
        deleted,
    )
    return result


def ensure_data_migrations_table(engine: Engine) -> None:
    """Tiny key/value ledger for one-shot data migrations."""
    ddl = """
    CREATE TABLE IF NOT EXISTS wms_data_migrations (
        migration_key VARCHAR(64) NOT NULL PRIMARY KEY,
        applied_at DATETIME NOT NULL,
        detail_json TEXT
    )
    """
    with engine.begin() as conn:
        conn.execute(text(ddl))


def is_migration_applied(db: Session, migration_key: str) -> bool:
    row = db.execute(
        text("SELECT 1 FROM wms_data_migrations WHERE migration_key = :k"),
        {"k": migration_key},
    ).first()
    return row is not None


def mark_migration_applied(
    db: Session,
    migration_key: str,
    *,
    detail: dict[str, Any] | None = None,
) -> None:
    import json

    db.execute(
        text("DELETE FROM wms_data_migrations WHERE migration_key = :k"),
        {"k": migration_key},
    )
    db.execute(
        text(
            """
            INSERT INTO wms_data_migrations (migration_key, applied_at, detail_json)
            VALUES (:k, :at, :detail)
            """
        ),
        {
            "k": migration_key,
            "at": datetime.utcnow().isoformat(sep=" ", timespec="seconds"),
            "detail": json.dumps(detail or {}, ensure_ascii=False),
        },
    )
    db.flush()


def _existing_by_agent(db: Session) -> dict[int, WmsWorkstation]:
    rows = (
        db.query(WmsWorkstation)
        .filter(WmsWorkstation.printer_agent_id.isnot(None))
        .all()
    )
    return {int(r.printer_agent_id): r for r in rows if r.printer_agent_id is not None}


def _existing_by_key(db: Session) -> dict[int, WmsWorkstation]:
    rows = (
        db.query(WmsWorkstation)
        .filter(WmsWorkstation.integration_api_key_id.isnot(None))
        .all()
    )
    return {
        int(r.integration_api_key_id): r
        for r in rows
        if r.integration_api_key_id is not None
    }


def migrate_agents_to_workstations(db: Session, *, force: bool = False) -> dict[str, Any]:
    """
    One-shot: create workstations for existing agents (and orphan pairing keys).

    - Does NOT attach keys to pre-existing empty user workstations.
    - Subsequent calls are no-ops once marked applied (unless force=True for tests).
    """
    try:
        already = is_migration_applied(db, MIGRATION_KEY_AGENTS_TO_WORKSTATIONS)
    except Exception:
        # Table may not exist yet in isolated unit tests — create via caller first.
        already = False

    if already and not force:
        logger.info(
            "[wms_workstations.migrate] skip already_applied key=%s",
            MIGRATION_KEY_AGENTS_TO_WORKSTATIONS,
        )
        return {
            "skipped": True,
            "created": 0,
            "linked_keys": 0,
            "mappings_copied": 0,
        }

    created = 0
    linked_keys = 0
    mappings_copied = 0

    by_agent = _existing_by_agent(db)
    by_key = _existing_by_key(db)

    agents = db.query(PrinterAgent).order_by(PrinterAgent.id.asc()).all()
    for agent in agents:
        if agent.id in by_agent:
            continue
        warehouse_id = agent.warehouse_id
        if warehouse_id is None:
            logger.warning(
                "[wms_workstations.migrate] skip_agent_no_warehouse agent_id=%s",
                agent.id,
            )
            continue
        name = (agent.name or agent.machine_id or f"Stanowisko {agent.id}").strip()
        ws = WmsWorkstation(
            tenant_id=agent.tenant_id,
            warehouse_id=int(warehouse_id),
            name=name[:120],
            station_type=STATION_TYPE_OTHER,
            description="Migracja z istniejącego Agenta",
            is_default=False,
            is_active=True,
            printer_agent_id=agent.id,
        )
        db.add(ws)
        db.flush()
        append_event(
            db,
            tenant_id=int(agent.tenant_id),
            workstation_id=ws.id,
            event_type=EVENT_CREATED,
            title="Utworzono stanowisko (migracja)",
            detail=name,
        )
        by_agent[agent.id] = ws
        created += 1

    # Orphan printer_agent keys: create a dedicated workstation only — never bind to
    # an existing empty station (that would hijack user-created workplaces).
    keys = (
        db.query(IntegrationApiKey)
        .filter(
            IntegrationApiKey.type == "printer_agent",
            IntegrationApiKey.is_active.is_(True),
            IntegrationApiKey.revoked_at.is_(None),
        )
        .order_by(IntegrationApiKey.id.asc())
        .all()
    )
    for key in keys:
        if key.id in by_key:
            continue
        if key.warehouse_id is None:
            continue
        name = (key.name or f"Stanowisko klucz #{key.id}").strip()[:120]
        ws = WmsWorkstation(
            tenant_id=key.tenant_id,
            warehouse_id=int(key.warehouse_id),
            name=name,
            station_type=STATION_TYPE_OTHER,
            description="Migracja z klucza połączenia Agenta",
            is_default=False,
            is_active=True,
            integration_api_key_id=key.id,
        )
        db.add(ws)
        db.flush()
        append_event(
            db,
            tenant_id=int(key.tenant_id),
            workstation_id=ws.id,
            event_type=EVENT_CREATED,
            title="Utworzono stanowisko (migracja klucza)",
            detail=name,
        )
        by_key[key.id] = ws
        created += 1
        linked_keys += 1

    defaults = db.query(PrintingDefault).all()
    for default in defaults:
        print_type = LEGACY_PRINTER_TYPE_TO_PRINT_TYPE.get(default.printer_type)
        if not print_type:
            continue
        wh_id = default.warehouse_id
        if wh_id is None:
            continue
        ws = (
            db.query(WmsWorkstation)
            .filter(
                WmsWorkstation.tenant_id == default.tenant_id,
                WmsWorkstation.warehouse_id == wh_id,
                WmsWorkstation.printer_agent_id.isnot(None),
            )
            .order_by(WmsWorkstation.is_default.desc(), WmsWorkstation.id.asc())
            .first()
        )
        if ws is None:
            continue
        from ...models.printing.agent_printer import AgentPrinter

        printer = (
            db.query(AgentPrinter)
            .filter(AgentPrinter.id == default.agent_printer_id)
            .first()
        )
        if printer is None or printer.agent_id != ws.printer_agent_id:
            continue
        exists = (
            db.query(WorkstationPrinterMapping)
            .filter(
                WorkstationPrinterMapping.workstation_id == ws.id,
                WorkstationPrinterMapping.print_profile == print_type,
            )
            .first()
        )
        if exists is not None:
            continue
        db.add(
            WorkstationPrinterMapping(
                workstation_id=ws.id,
                print_profile=print_type,
                agent_printer_id=default.agent_printer_id,
            )
        )
        mappings_copied += 1

    result = {
        "skipped": False,
        "created": created,
        "linked_keys": linked_keys,
        "mappings_copied": mappings_copied,
    }
    mark_migration_applied(db, MIGRATION_KEY_AGENTS_TO_WORKSTATIONS, detail=result)
    db.flush()
    logger.info(
        "[wms_workstations.migrate] applied key=%s created=%s linked_keys=%s mappings=%s",
        MIGRATION_KEY_AGENTS_TO_WORKSTATIONS,
        created,
        linked_keys,
        mappings_copied,
    )
    return result
