"""product_warehouse_slotting table + idempotent backfill from products.assigned_locations."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

PRODUCT_WAREHOUSE_SLOTTING_SCHEMA_VERSION = "2026.06.08.slotting"


def ensure_product_warehouse_slotting_schema(engine: Engine) -> None:
    dialect = engine.dialect.name
    if not has_table(engine, "product_warehouse_slotting"):
        if dialect == "postgresql":
            ddl = """
            CREATE TABLE product_warehouse_slotting (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                location_uuid VARCHAR(64) NOT NULL,
                quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
                storage_type VARCHAR(32) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_product_wh_slotting_product_wh_uuid
                    UNIQUE (product_id, warehouse_id, location_uuid)
            )
            """
        else:
            ddl = """
            CREATE TABLE product_warehouse_slotting (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                location_uuid VARCHAR(64) NOT NULL,
                quantity REAL NOT NULL DEFAULT 0,
                storage_type VARCHAR(32) NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                UNIQUE (product_id, warehouse_id, location_uuid)
            )
            """
        with engine.begin() as conn:
            conn.execute(text(ddl))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_pws_tenant_wh "
                    "ON product_warehouse_slotting(tenant_id, warehouse_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_pws_product_wh "
                    "ON product_warehouse_slotting(product_id, warehouse_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_pws_wh_uuid "
                    "ON product_warehouse_slotting(warehouse_id, location_uuid)"
                )
            )
        logger.info("[product_warehouse_slotting] created table")

    cols = get_table_column_names(engine, "product_warehouse_slotting")
    if cols:
        logger.info(
            "[product_warehouse_slotting] schema ok version=%s columns=%s",
            PRODUCT_WAREHOUSE_SLOTTING_SCHEMA_VERSION,
            sorted(cols),
        )


def run_startup_slotting_backfill(engine: Engine) -> None:
    """Lightweight idempotent backfill after schema ensure (startup)."""
    if not has_table(engine, "product_warehouse_slotting"):
        return
    from ..database import SessionLocal
    from ..services.product_warehouse_slotting_service import backfill_slotting_from_assigned_locations

    db = SessionLocal()
    try:
        stats = backfill_slotting_from_assigned_locations(db, tenant_id=None, dry_run=False)
        if stats.get("inserted", 0) > 0:
            db.commit()
            logger.info("[product_warehouse_slotting] startup backfill %s", stats)
        else:
            db.rollback()
    except Exception:
        db.rollback()
        logger.exception("[product_warehouse_slotting] startup backfill failed")
    finally:
        db.close()
