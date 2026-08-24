"""Etap 3B + Phase 1 MODEL B: inventory_management_mode on wms_settings (per tenant + warehouse)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

INVENTORY_MANAGEMENT_POLICY_SCHEMA_VERSION = "2026.08.24.model_b_phase1"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[inventory_management] added %s.%s", table, column)


def ensure_inventory_management_policy_schema(engine: Engine) -> None:
    """Add inventory_management_mode and allow_manual_warehouse_document_execution."""
    _add_column(
        engine,
        "wms_settings",
        "inventory_management_mode",
        "ALTER TABLE wms_settings ADD COLUMN inventory_management_mode VARCHAR(32) NOT NULL DEFAULT 'HYBRID'",
        "ALTER TABLE wms_settings ADD COLUMN inventory_management_mode VARCHAR(32) NOT NULL DEFAULT 'HYBRID'",
    )
    _add_column(
        engine,
        "wms_settings",
        "allow_manual_warehouse_document_execution",
        "ALTER TABLE wms_settings ADD COLUMN allow_manual_warehouse_document_execution BOOLEAN NOT NULL DEFAULT 0",
        "ALTER TABLE wms_settings ADD COLUMN allow_manual_warehouse_document_execution BOOLEAN NOT NULL DEFAULT false",
    )
    if not has_table(engine, "wms_settings"):
        return
    cols = get_table_column_names(engine, "wms_settings")
    if "inventory_management_mode" in cols:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE wms_settings SET inventory_management_mode = 'HYBRID' "
                    "WHERE inventory_management_mode IS NULL OR TRIM(inventory_management_mode) = ''"
                )
            )
    if "allow_manual_warehouse_document_execution" in cols:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE wms_settings SET allow_manual_warehouse_document_execution = "
                    "COALESCE(allow_manual_warehouse_document_execution, false) "
                    "WHERE allow_manual_warehouse_document_execution IS NULL"
                )
            )
