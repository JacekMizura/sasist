"""P2.5A — warehouse_workflow_status + purchase_workflow_status on stock_documents."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

RECEIVING_WORKFLOW_STATUS_SCHEMA_VERSION = "2026.06.08.p2_5a_workflow_status"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[receiving_workflow_status] added %s.%s", table, column)


def ensure_receiving_workflow_status_schema(engine: Engine) -> None:
    _add_column(
        engine,
        "stock_documents",
        "warehouse_workflow_status",
        "ALTER TABLE stock_documents ADD COLUMN warehouse_workflow_status VARCHAR(32) NOT NULL DEFAULT 'NEW'",
        "ALTER TABLE stock_documents ADD COLUMN warehouse_workflow_status VARCHAR(32) NOT NULL DEFAULT 'NEW'",
    )
    _add_column(
        engine,
        "stock_documents",
        "purchase_workflow_status",
        "ALTER TABLE stock_documents ADD COLUMN purchase_workflow_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_INVOICE'",
        "ALTER TABLE stock_documents ADD COLUMN purchase_workflow_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_INVOICE'",
    )
