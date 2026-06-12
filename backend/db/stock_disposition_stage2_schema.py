"""Etap 2: disposition on order lines, reservations, pick tasks."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

STOCK_DISPOSITION_STAGE2_SCHEMA_VERSION = "2026.06.08.2"


def _add_varchar_column(
    engine: Engine,
    table: str,
    column: str,
    *,
    not_null_default: str,
    index_sqlite: str | None = None,
) -> None:
    if not has_table(engine, table):
        return
    existing = get_table_column_names(engine, table)
    if column in existing:
        return
    dialect = engine.dialect.name
    default = not_null_default.replace("'", "''")
    if dialect == "postgresql":
        ddl = (
            f"ALTER TABLE {table} ADD COLUMN {column} VARCHAR(32) "
            f"NOT NULL DEFAULT '{default}'"
        )
    else:
        ddl = (
            f"ALTER TABLE {table} ADD COLUMN {column} VARCHAR(32) "
            f"NOT NULL DEFAULT '{default}'"
        )
    with engine.begin() as conn:
        conn.execute(text(ddl))
        if index_sqlite:
            conn.execute(text(index_sqlite))
    logger.info("[stock_disposition.stage2] added %s.%s", table, column)


def ensure_stock_disposition_stage2_columns(engine: Engine) -> None:
    _add_varchar_column(
        engine,
        "order_items",
        "required_stock_disposition",
        not_null_default="SALEABLE",
        index_sqlite="CREATE INDEX IF NOT EXISTS ix_order_items_required_stock_disposition "
        "ON order_items(required_stock_disposition)",
    )
    _add_varchar_column(
        engine,
        "stock_reservations",
        "stock_disposition",
        not_null_default="SALEABLE",
        index_sqlite=(
            "CREATE INDEX IF NOT EXISTS ix_stock_res_tenant_prod_loc_disp_status "
            "ON stock_reservations(tenant_id, product_id, location_id, stock_disposition, status)"
        ),
    )
    existing_pick = get_table_column_names(engine, "pick_tasks") if has_table(engine, "pick_tasks") else set()
    if has_table(engine, "pick_tasks") and "stock_disposition" not in existing_pick:
        dialect = engine.dialect.name
        ddl = (
            "ALTER TABLE pick_tasks ADD COLUMN stock_disposition VARCHAR(32) NULL"
            if dialect == "postgresql"
            else "ALTER TABLE pick_tasks ADD COLUMN stock_disposition VARCHAR(32)"
        )
        with engine.begin() as conn:
            conn.execute(text(ddl))
        logger.info("[stock_disposition.stage2] added pick_tasks.stock_disposition")
