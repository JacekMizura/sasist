"""Schema for production shortages — substitutes + material needs."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import has_table

logger = logging.getLogger(__name__)


def ensure_production_shortage_schema(engine: Engine) -> int:
    steps = 0
    dialect = engine.dialect.name
    with engine.connect() as conn:
        if not has_table(conn, "product_material_substitutes"):
            if dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE product_material_substitutes (
                            id SERIAL PRIMARY KEY,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            substitute_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            priority INTEGER NOT NULL DEFAULT 10,
                            conversion_ratio DOUBLE PRECISION NOT NULL DEFAULT 1.0,
                            is_active BOOLEAN NOT NULL DEFAULT TRUE,
                            notes TEXT,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            CONSTRAINT uq_product_material_substitute UNIQUE (tenant_id, product_id, substitute_product_id)
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE product_material_substitutes (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            substitute_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            priority INTEGER NOT NULL DEFAULT 10,
                            conversion_ratio REAL NOT NULL DEFAULT 1.0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            notes TEXT,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE (tenant_id, product_id, substitute_product_id)
                        )
                        """
                    )
                )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_pms_tenant_product ON product_material_substitutes(tenant_id, product_id)"
                )
            )
            steps += 1

        if not has_table(conn, "production_material_needs"):
            if dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE production_material_needs (
                            id SERIAL PRIMARY KEY,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                            component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            shortage_qty DOUBLE PRECISION NOT NULL,
                            status VARCHAR(24) NOT NULL DEFAULT 'open',
                            purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
                            purchase_order_item_id INTEGER REFERENCES purchase_order_items(id) ON DELETE SET NULL,
                            source_ref_json TEXT,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE production_material_needs (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                            component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            shortage_qty REAL NOT NULL,
                            status TEXT NOT NULL DEFAULT 'open',
                            purchase_order_id INTEGER REFERENCES purchase_orders(id) ON DELETE SET NULL,
                            purchase_order_item_id INTEGER REFERENCES purchase_order_items(id) ON DELETE SET NULL,
                            source_ref_json TEXT,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_pmn_wh_product ON production_material_needs(warehouse_id, component_product_id, status)"
                )
            )
            steps += 1

        from .schema_introspection import get_table_column_names

        if has_table(conn, "production_material_needs"):
            cols = get_table_column_names(conn, "production_material_needs")
            if "covered_qty" not in cols:
                if dialect == "postgresql":
                    conn.execute(text("ALTER TABLE production_material_needs ADD COLUMN covered_qty DOUBLE PRECISION NOT NULL DEFAULT 0"))
                else:
                    conn.execute(text("ALTER TABLE production_material_needs ADD COLUMN covered_qty REAL NOT NULL DEFAULT 0"))
                steps += 1
            if "history_json" not in cols:
                conn.execute(text("ALTER TABLE production_material_needs ADD COLUMN history_json TEXT"))
                steps += 1

        conn.commit()
    if steps:
        logger.info("[schema.production_shortage] steps=%s", steps)
    return steps
