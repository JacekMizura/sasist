"""Schema for MRP extensions — recipe variants, substitution decisions."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import has_table

logger = logging.getLogger(__name__)


def ensure_production_mrp_schema(engine: Engine) -> int:
    steps = 0
    dialect = engine.dialect.name
    with engine.connect() as conn:
        if not has_table(conn, "product_recipe_variants"):
            if dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE product_recipe_variants (
                            id SERIAL PRIMARY KEY,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            composition_id INTEGER NOT NULL REFERENCES product_compositions(id) ON DELETE CASCADE,
                            variant_code VARCHAR(24) NOT NULL DEFAULT 'STANDARD',
                            variant_label VARCHAR(120) NOT NULL DEFAULT 'Receptura standardowa',
                            priority INTEGER NOT NULL DEFAULT 10,
                            is_default BOOLEAN NOT NULL DEFAULT FALSE,
                            is_active BOOLEAN NOT NULL DEFAULT TRUE,
                            notes TEXT,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            CONSTRAINT uq_product_recipe_variant_code UNIQUE (tenant_id, product_id, variant_code)
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE product_recipe_variants (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            composition_id INTEGER NOT NULL REFERENCES product_compositions(id) ON DELETE CASCADE,
                            variant_code TEXT NOT NULL DEFAULT 'STANDARD',
                            variant_label TEXT NOT NULL DEFAULT 'Receptura standardowa',
                            priority INTEGER NOT NULL DEFAULT 10,
                            is_default INTEGER NOT NULL DEFAULT 0,
                            is_active INTEGER NOT NULL DEFAULT 1,
                            notes TEXT,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            UNIQUE (tenant_id, product_id, variant_code)
                        )
                        """
                    )
                )
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS ix_prv_product ON product_recipe_variants(tenant_id, product_id)")
            )
            steps += 1

        if not has_table(conn, "production_material_substitution_decisions"):
            if dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE production_material_substitution_decisions (
                            id SERIAL PRIMARY KEY,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                            production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE CASCADE,
                            production_order_id INTEGER REFERENCES production_orders(id) ON DELETE CASCADE,
                            original_component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            substitute_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            conversion_ratio DOUBLE PRECISION NOT NULL DEFAULT 1.0,
                            quantity_original DOUBLE PRECISION NOT NULL DEFAULT 0,
                            quantity_substitute DOUBLE PRECISION NOT NULL DEFAULT 0,
                            status VARCHAR(16) NOT NULL DEFAULT 'accepted',
                            decided_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                            notes TEXT,
                            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE production_material_substitution_decisions (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                            warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                            production_batch_id INTEGER REFERENCES production_batches(id) ON DELETE CASCADE,
                            production_order_id INTEGER REFERENCES production_orders(id) ON DELETE CASCADE,
                            original_component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            substitute_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                            conversion_ratio REAL NOT NULL DEFAULT 1.0,
                            quantity_original REAL NOT NULL DEFAULT 0,
                            quantity_substitute REAL NOT NULL DEFAULT 0,
                            status TEXT NOT NULL DEFAULT 'accepted',
                            decided_by_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                            notes TEXT,
                            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                        )
                        """
                    )
                )
            steps += 1
        conn.commit()
    if steps:
        logger.info("[schema.production_mrp] steps=%s", steps)
    return steps
