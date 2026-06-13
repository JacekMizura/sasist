"""P3 — order fulfillment assignment phase + audit table."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

ORDER_FULFILLMENT_LIFECYCLE_SCHEMA_VERSION = "2026.06.08.p3.fulfillment_lifecycle"


def ensure_order_fulfillment_lifecycle_schema(engine: Engine) -> None:
    if engine.dialect.name == "postgresql":
        audit_ddl = """
        CREATE TABLE IF NOT EXISTS order_fulfillment_assignment_audits (
            id SERIAL PRIMARY KEY,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            assigned_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            strategy VARCHAR(32) NOT NULL,
            assigned_by_user_id INTEGER NULL REFERENCES app_users(id) ON DELETE SET NULL,
            reason TEXT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    else:
        audit_ddl = """
        CREATE TABLE IF NOT EXISTS order_fulfillment_assignment_audits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            assigned_warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
            strategy VARCHAR(32) NOT NULL,
            assigned_by_user_id INTEGER NULL REFERENCES app_users(id) ON DELETE SET NULL,
            reason TEXT NULL,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    with engine.begin() as conn:
        conn.execute(text(audit_ddl))
        if has_table(engine, "order_fulfillment_assignment_audits"):
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_ofaa_order_id "
                    "ON order_fulfillment_assignment_audits(order_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_ofaa_created_at "
                    "ON order_fulfillment_assignment_audits(created_at)"
                )
            )

        if has_table(engine, "orders") and "fulfillment_assignment_phase" not in get_table_column_names(
            engine, "orders"
        ):
            conn.execute(
                text(
                    "ALTER TABLE orders ADD COLUMN fulfillment_assignment_phase "
                    "VARCHAR(32) NOT NULL DEFAULT 'FULFILLMENT_ASSIGNED'"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_orders_fulfillment_assignment_phase "
                    "ON orders(fulfillment_assignment_phase)"
                )
            )
            conn.execute(
                text(
                    "UPDATE orders SET fulfillment_assignment_phase = 'FULFILLMENT_ASSIGNED' "
                    "WHERE fulfillment_assignment_phase IS NULL OR fulfillment_assignment_phase = ''"
                )
            )

    logger.info("[order_fulfillment_lifecycle] schema ok version=%s", ORDER_FULFILLMENT_LIFECYCLE_SCHEMA_VERSION)
