"""Offer stock pools + product_sales_offers.stock_pool_id."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

OFFER_STOCK_POOL_SCHEMA_VERSION = "2026.06.08.pools"


def _add_nullable_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[offer_stock_pool] added %s.%s", table, column)


def ensure_offer_stock_pool_schema(engine: Engine) -> None:
    dialect = engine.dialect.name
    if not has_table(engine, "offer_stock_pools"):
        if dialect == "postgresql":
            ddl_pools = """
            CREATE TABLE offer_stock_pools (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                name VARCHAR(256) NOT NULL,
                is_default BOOLEAN NOT NULL DEFAULT false,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT uq_offer_stock_pool_tenant_name UNIQUE (tenant_id, name)
            )
            """
            ddl_links = """
            CREATE TABLE offer_stock_pool_warehouses (
                pool_id INTEGER NOT NULL REFERENCES offer_stock_pools(id) ON DELETE CASCADE,
                warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                PRIMARY KEY (pool_id, warehouse_id),
                CONSTRAINT uq_offer_stock_pool_wh UNIQUE (pool_id, warehouse_id)
            )
            """
        else:
            ddl_pools = """
            CREATE TABLE offer_stock_pools (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                name VARCHAR(256) NOT NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                UNIQUE (tenant_id, name)
            )
            """
            ddl_links = """
            CREATE TABLE offer_stock_pool_warehouses (
                pool_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                PRIMARY KEY (pool_id, warehouse_id),
                FOREIGN KEY(pool_id) REFERENCES offer_stock_pools(id) ON DELETE CASCADE,
                FOREIGN KEY(warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
                UNIQUE (pool_id, warehouse_id)
            )
            """
        with engine.begin() as conn:
            conn.execute(text(ddl_pools))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_offer_stock_pools_tenant "
                    "ON offer_stock_pools(tenant_id)"
                )
            )
            conn.execute(text(ddl_links))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_offer_stock_pool_wh_warehouse "
                    "ON offer_stock_pool_warehouses(warehouse_id)"
                )
            )
        logger.info("[offer_stock_pool] created offer_stock_pools tables")

    _add_nullable_column(
        engine,
        "product_sales_offers",
        "stock_pool_id",
        "ALTER TABLE product_sales_offers ADD COLUMN stock_pool_id INTEGER NULL",
        "ALTER TABLE product_sales_offers ADD COLUMN stock_pool_id INTEGER NULL",
    )

    if not has_table(engine, "offer_stock_pools"):
        return

    if not has_table(engine, "tenants"):
        return

    from ..database import SessionLocal
    from ..services.offer_stock_pool_service import ensure_default_pool_for_tenant

    db = SessionLocal()
    try:
        tenant_ids = [int(r[0]) for r in db.execute(text("SELECT DISTINCT id FROM tenants")).fetchall()]
        for tid in tenant_ids:
            ensure_default_pool_for_tenant(db, tenant_id=tid)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("[offer_stock_pool] default pool bootstrap failed")
    finally:
        db.close()
