"""P5 — order consolidation plan tables."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

ORDER_CONSOLIDATION_SCHEMA_VERSION = "2026.06.08.p5.2.consolidation.exceptions"


def ensure_order_consolidation_schema(engine: Engine) -> None:
    if engine.dialect.name == "postgresql":
        plan_ddl = """
        CREATE TABLE IF NOT EXISTS order_consolidation_plans (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            target_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
        item_ddl = """
        CREATE TABLE IF NOT EXISTS order_consolidation_plan_items (
            id SERIAL PRIMARY KEY,
            plan_id INTEGER NOT NULL REFERENCES order_consolidation_plans(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            quantity DOUBLE PRECISION NOT NULL,
            source_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            target_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            status VARCHAR(32) NOT NULL DEFAULT 'WAITING',
            stock_document_id INTEGER NULL REFERENCES stock_documents(id) ON DELETE SET NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
        alert_ddl = """
        CREATE TABLE IF NOT EXISTS order_consolidation_alerts (
            id SERIAL PRIMARY KEY,
            plan_id INTEGER NOT NULL REFERENCES order_consolidation_plans(id) ON DELETE CASCADE,
            plan_item_id INTEGER NULL REFERENCES order_consolidation_plan_items(id) ON DELETE SET NULL,
            severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
            code VARCHAR(64) NOT NULL,
            message TEXT NOT NULL,
            resolved BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    else:
        plan_ddl = """
        CREATE TABLE IF NOT EXISTS order_consolidation_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            target_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
        item_ddl = """
        CREATE TABLE IF NOT EXISTS order_consolidation_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL REFERENCES order_consolidation_plans(id) ON DELETE CASCADE,
            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
            quantity REAL NOT NULL,
            source_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            target_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            status VARCHAR(32) NOT NULL DEFAULT 'WAITING',
            stock_document_id INTEGER NULL REFERENCES stock_documents(id) ON DELETE SET NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
        alert_ddl = """
        CREATE TABLE IF NOT EXISTS order_consolidation_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL REFERENCES order_consolidation_plans(id) ON DELETE CASCADE,
            plan_item_id INTEGER NULL REFERENCES order_consolidation_plan_items(id) ON DELETE SET NULL,
            severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
            code VARCHAR(64) NOT NULL,
            message TEXT NOT NULL,
            resolved BOOLEAN NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    with engine.begin() as conn:
        conn.execute(text(plan_ddl))
        conn.execute(text(item_ddl))
        conn.execute(text(alert_ddl))
        if has_table(engine, "order_consolidation_plans"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_ocp_order_id "
                    "ON order_consolidation_plans(order_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_ocp_status "
                    "ON order_consolidation_plans(status)"
                )
            )
        if has_table(engine, "order_consolidation_plan_items"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_ocpi_plan_id "
                    "ON order_consolidation_plan_items(plan_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_ocpi_stock_document_id "
                    "ON order_consolidation_plan_items(stock_document_id)"
                )
            )
        if has_table(engine, "order_consolidation_alerts"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_oca_plan_id "
                    "ON order_consolidation_alerts(plan_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_oca_resolved "
                    "ON order_consolidation_alerts(resolved)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_oca_severity "
                    "ON order_consolidation_alerts(severity)"
                )
            )

        if has_table(engine, "tenant_fulfillment_configurations"):
            cols = get_table_column_names(engine, "tenant_fulfillment_configurations")
            if "consolidation_warehouse_id" not in cols:
                conn.execute(
                    text(
                        "ALTER TABLE tenant_fulfillment_configurations "
                        "ADD COLUMN consolidation_warehouse_id INTEGER NULL "
                        "REFERENCES warehouses(id) ON DELETE SET NULL"
                    )
                )
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_tfc_consolidation_warehouse_id "
                        "ON tenant_fulfillment_configurations(consolidation_warehouse_id)"
                    )
                )

    logger.info("[order_consolidation] schema ok version=%s", ORDER_CONSOLIDATION_SCHEMA_VERSION)
