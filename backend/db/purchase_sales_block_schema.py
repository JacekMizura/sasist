"""Purchase PZ line sales block (commercial overlay — no inventory grain change)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

PURCHASE_SALES_BLOCK_SCHEMA_VERSION = "2026.06.08.sales_block_mvp"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[purchase_sales_block] added %s.%s", table, column)


def ensure_purchase_sales_block_schema(engine: Engine) -> None:
    _add_column(
        engine,
        "stock_document_items",
        "sales_blocked_qty",
        "ALTER TABLE stock_document_items ADD COLUMN sales_blocked_qty REAL NOT NULL DEFAULT 0",
        "ALTER TABLE stock_document_items ADD COLUMN sales_blocked_qty DOUBLE PRECISION NOT NULL DEFAULT 0",
    )
    _add_column(
        engine,
        "stock_document_items",
        "sales_block_reason_code",
        "ALTER TABLE stock_document_items ADD COLUMN sales_block_reason_code VARCHAR(64)",
        "ALTER TABLE stock_document_items ADD COLUMN sales_block_reason_code VARCHAR(64)",
    )
    _add_column(
        engine,
        "stock_document_items",
        "sales_block_note",
        "ALTER TABLE stock_document_items ADD COLUMN sales_block_note TEXT",
        "ALTER TABLE stock_document_items ADD COLUMN sales_block_note TEXT",
    )
    _add_column(
        engine,
        "stock_document_items",
        "sales_blocked_at",
        "ALTER TABLE stock_document_items ADD COLUMN sales_blocked_at DATETIME",
        "ALTER TABLE stock_document_items ADD COLUMN sales_blocked_at TIMESTAMP",
    )
    _add_column(
        engine,
        "stock_document_items",
        "sales_blocked_by_user_id",
        "ALTER TABLE stock_document_items ADD COLUMN sales_blocked_by_user_id INTEGER "
        "REFERENCES app_users(id) ON DELETE SET NULL",
        "ALTER TABLE stock_document_items ADD COLUMN sales_blocked_by_user_id INTEGER "
        "REFERENCES app_users(id) ON DELETE SET NULL",
    )
