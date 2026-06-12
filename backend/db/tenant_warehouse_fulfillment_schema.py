"""TenantWarehouse network stock + fulfillment settings (multi-WH foundation)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

TENANT_WAREHOUSE_FULFILLMENT_SCHEMA_VERSION = "2026.06.08.tenant_warehouse_fulfillment"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[tenant_warehouse_fulfillment] added %s.%s", table, column)


def ensure_tenant_warehouse_fulfillment_schema(engine: Engine) -> None:
    _add_column(
        engine,
        "tenant_warehouses",
        "participates_in_network_stock",
        "ALTER TABLE tenant_warehouses ADD COLUMN participates_in_network_stock INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE tenant_warehouses ADD COLUMN participates_in_network_stock BOOLEAN NOT NULL DEFAULT TRUE",
    )
    _add_column(
        engine,
        "tenant_warehouses",
        "fulfillment_eligible",
        "ALTER TABLE tenant_warehouses ADD COLUMN fulfillment_eligible INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE tenant_warehouses ADD COLUMN fulfillment_eligible BOOLEAN NOT NULL DEFAULT TRUE",
    )
    _add_column(
        engine,
        "tenant_warehouses",
        "fulfillment_priority",
        "ALTER TABLE tenant_warehouses ADD COLUMN fulfillment_priority INTEGER NOT NULL DEFAULT 100",
        "ALTER TABLE tenant_warehouses ADD COLUMN fulfillment_priority INTEGER NOT NULL DEFAULT 100",
    )
