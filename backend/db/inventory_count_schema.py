"""
Inventory count module — resilient schema evolution (PostgreSQL + SQLite).

Tier 1 operational module: failures must not block core OMS/WMS startup.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

INVENTORY_COUNT_SCHEMA_VERSION = "2026.06.08.1"


@dataclass(frozen=True)
class InventoryCountEntitySpec:
    table_name: str
    model: Any
    label: str = ""


def _inventory_count_entity_registry() -> list[InventoryCountEntitySpec]:
    from ..models.inventory_count import (
        InventoryAdjustment,
        InventoryAuditEvent,
        InventoryCountEntry,
        InventoryDocument,
        InventoryDocumentLine,
        InventoryLineAttachment,
        InventoryLocationLock,
        InventorySession,
        InventorySnapshot,
        InventorySnapshotReservationLine,
        InventorySnapshotSerialLine,
        InventorySnapshotStockLine,
        InventoryTask,
    )

    return [
        InventoryCountEntitySpec("inventory_documents", InventoryDocument, "document"),
        InventoryCountEntitySpec("inventory_document_lines", InventoryDocumentLine, "document_line"),
        InventoryCountEntitySpec("inventory_count_entries", InventoryCountEntry, "count_entry"),
        InventoryCountEntitySpec("inventory_snapshots", InventorySnapshot, "snapshot"),
        InventoryCountEntitySpec("inventory_snapshot_stock_lines", InventorySnapshotStockLine, "snapshot_stock"),
        InventoryCountEntitySpec(
            "inventory_snapshot_reservation_lines",
            InventorySnapshotReservationLine,
            "snapshot_reservation",
        ),
        InventoryCountEntitySpec("inventory_snapshot_serial_lines", InventorySnapshotSerialLine, "snapshot_serial"),
        InventoryCountEntitySpec("inventory_adjustments", InventoryAdjustment, "adjustment"),
        InventoryCountEntitySpec("inventory_tasks", InventoryTask, "task"),
        InventoryCountEntitySpec("inventory_sessions", InventorySession, "session"),
        InventoryCountEntitySpec("inventory_location_locks", InventoryLocationLock, "location_lock"),
        InventoryCountEntitySpec("inventory_audit_events", InventoryAuditEvent, "audit_event"),
        InventoryCountEntitySpec("inventory_line_attachments", InventoryLineAttachment, "line_attachment"),
    ]


def _create_table_from_model(engine: Engine, model: Any) -> None:
    ddl = str(CreateTable(model.__table__).compile(dialect=engine.dialect))
    from sqlalchemy import text

    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[inventory_count.schema] created_table table=%s dialect=%s",
        model.__tablename__,
        engine.dialect.name,
    )


def ensure_inventory_count_schema(engine: Engine) -> int:
    """
    Create missing inventory count tables and sync ORM columns.

    Returns number of columns added via sync (table creates are logged separately).
    """
    added = 0
    for spec in _inventory_count_entity_registry():
        if not has_table(engine, spec.table_name):
            try:
                _create_table_from_model(engine, spec.model)
            except Exception:
                logger.exception(
                    "[inventory_count.schema] create_table_failed table=%s",
                    spec.table_name,
                )
                continue
        try:
            added += ensure_model_schema_sync(
                engine,
                spec.model,
                log_prefix="inventory_count.schema.sync",
                sync_indexes=True,
            )
        except Exception:
            logger.exception(
                "[inventory_count.schema] sync_failed table=%s",
                spec.table_name,
            )
    logger.info(
        "[inventory_count.schema] complete version=%s columns_added=%s dialect=%s",
        INVENTORY_COUNT_SCHEMA_VERSION,
        added,
        engine.dialect.name,
    )
    return added
