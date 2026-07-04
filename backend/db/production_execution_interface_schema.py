"""Migrate execution_mode → execution_interface (PAPER → ERP)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

_TABLES = ("production_batches", "production_orders")


def ensure_production_execution_interface_schema(engine: Engine) -> int:
    steps = 0
    with engine.connect() as conn:
        for table in _TABLES:
            if not has_table(conn, table):
                continue
            cols = get_table_column_names(conn, table)
            if "execution_interface" not in cols:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN execution_interface VARCHAR(16)"))
                steps += 1
            cols = get_table_column_names(conn, table)
            if "execution_mode" in cols:
                conn.execute(
                    text(
                        f"""
                        UPDATE {table}
                        SET execution_interface = CASE
                            WHEN UPPER(COALESCE(execution_mode, '')) = 'PAPER' THEN 'ERP'
                            WHEN UPPER(COALESCE(execution_mode, '')) = 'WMS' THEN 'WMS'
                            ELSE execution_mode
                        END
                        WHERE execution_interface IS NULL AND execution_mode IS NOT NULL
                        """
                    )
                )
                steps += 1
        conn.commit()
    if steps:
        logger.info("[schema.production] execution_interface migration steps=%s", steps)
    return steps
