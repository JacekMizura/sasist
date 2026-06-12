"""Inventory damage trace columns — persisted after Z-PZ putaway."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

INVENTORY_DAMAGE_TRACE_SCHEMA_VERSION = "2026.06.08.1"

_INVENTORY_COLUMNS: tuple[tuple[str, str, str], ...] = (
    (
        "source_document_line_id",
        "ALTER TABLE inventory ADD COLUMN source_document_line_id INTEGER "
        "REFERENCES stock_document_items(id) ON DELETE SET NULL",
        "ALTER TABLE inventory ADD COLUMN source_document_line_id INTEGER "
        "REFERENCES stock_document_items(id) ON DELETE SET NULL",
    ),
    (
        "damage_class",
        "ALTER TABLE inventory ADD COLUMN damage_class VARCHAR(8)",
        "ALTER TABLE inventory ADD COLUMN damage_class VARCHAR(8)",
    ),
    (
        "damage_reason_codes_json",
        "ALTER TABLE inventory ADD COLUMN damage_reason_codes_json TEXT",
        "ALTER TABLE inventory ADD COLUMN damage_reason_codes_json TEXT",
    ),
    (
        "damage_reason_labels_json",
        "ALTER TABLE inventory ADD COLUMN damage_reason_labels_json TEXT",
        "ALTER TABLE inventory ADD COLUMN damage_reason_labels_json TEXT",
    ),
    (
        "damage_source_reference",
        "ALTER TABLE inventory ADD COLUMN damage_source_reference VARCHAR(64)",
        "ALTER TABLE inventory ADD COLUMN damage_source_reference VARCHAR(64)",
    ),
    (
        "damage_decided_at",
        "ALTER TABLE inventory ADD COLUMN damage_decided_at TIMESTAMP",
        "ALTER TABLE inventory ADD COLUMN damage_decided_at TIMESTAMP",
    ),
    (
        "damage_decided_by_user_id",
        "ALTER TABLE inventory ADD COLUMN damage_decided_by_user_id INTEGER "
        "REFERENCES app_users(id) ON DELETE SET NULL",
        "ALTER TABLE inventory ADD COLUMN damage_decided_by_user_id INTEGER "
        "REFERENCES app_users(id) ON DELETE SET NULL",
    ),
)


def ensure_inventory_damage_trace_columns(engine: Engine) -> None:
    if not has_table(engine, "inventory"):
        return
    dialect = engine.dialect.name
    existing = get_table_column_names(engine, "inventory")
    for col, ddl_sqlite, ddl_pg in _INVENTORY_COLUMNS:
        if col in existing:
            continue
        ddl = ddl_pg if dialect == "postgresql" else ddl_sqlite
        with engine.begin() as conn:
            conn.execute(text(ddl))
        logger.info("[inventory.damage_trace] added column inventory.%s", col)
