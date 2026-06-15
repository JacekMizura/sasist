"""P2.5C — warehouse.requires_putaway (WMS vs simple warehouse profile)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

WAREHOUSE_REQUIRES_PUTAWAY_SCHEMA_VERSION = "2026.06.08.p2_5c_requires_putaway"


def ensure_warehouse_requires_putaway_schema(engine: Engine) -> None:
    if not has_table(engine, "warehouses"):
        return
    if "requires_putaway" in get_table_column_names(engine, "warehouses"):
        return
    ddl_sqlite = (
        "ALTER TABLE warehouses ADD COLUMN requires_putaway INTEGER NOT NULL DEFAULT 1"
    )
    ddl_pg = (
        "ALTER TABLE warehouses ADD COLUMN requires_putaway BOOLEAN NOT NULL DEFAULT TRUE"
    )
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[warehouse_requires_putaway] added warehouses.requires_putaway")
