"""P2.5 — tenant fulfillment assignment configuration table."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

TENANT_FULFILLMENT_CONFIGURATION_SCHEMA_VERSION = "2026.06.08.p2.5.fulfillment_config"


def ensure_tenant_fulfillment_configuration_schema(engine: Engine) -> None:
    if engine.dialect.name == "postgresql":
        ddl = """
        CREATE TABLE IF NOT EXISTS tenant_fulfillment_configurations (
            id SERIAL PRIMARY KEY,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            fulfillment_assignment_mode VARCHAR(32) NOT NULL DEFAULT 'DEFAULT_WAREHOUSE',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_tenant_fulfillment_configuration_tenant UNIQUE (tenant_id)
        )
        """
    else:
        ddl = """
        CREATE TABLE IF NOT EXISTS tenant_fulfillment_configurations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
            fulfillment_assignment_mode VARCHAR(32) NOT NULL DEFAULT 'DEFAULT_WAREHOUSE',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_tenant_fulfillment_configuration_tenant UNIQUE (tenant_id)
        )
        """
    with engine.begin() as conn:
        conn.execute(text(ddl))
        if has_table(engine, "tenant_fulfillment_configurations"):
            cols = get_table_column_names(engine, "tenant_fulfillment_configurations")
            if "fulfillment_assignment_mode" in cols:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_tfc_fulfillment_assignment_mode "
                        "ON tenant_fulfillment_configurations(fulfillment_assignment_mode)"
                    )
                )
    logger.info("[tenant_fulfillment_configuration] schema ok version=%s", TENANT_FULFILLMENT_CONFIGURATION_SCHEMA_VERSION)
