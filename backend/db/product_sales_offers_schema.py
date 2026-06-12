"""Etap 3A: product_sales_offers + FK on order lines / POS session lines."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

PRODUCT_SALES_OFFERS_SCHEMA_VERSION = "2026.06.08.3a"


def _add_nullable_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[product_sales_offers.3a] added %s.%s", table, column)


def ensure_product_sales_offers_schema(engine: Engine) -> None:
    dialect = engine.dialect.name
    if not has_table(engine, "product_sales_offers"):
        if dialect == "postgresql":
            ddl = """
            CREATE TABLE product_sales_offers (
                id SERIAL PRIMARY KEY,
                tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
                name VARCHAR(512) NOT NULL,
                sale_price_net NUMERIC(12, 2) NULL,
                is_default BOOLEAN NOT NULL DEFAULT false,
                active BOOLEAN NOT NULL DEFAULT true,
                outlet_damage_class VARCHAR(8) NULL,
                outlet_damage_reasons_json TEXT NULL,
                outlet_description TEXT NULL,
                deleted_at TIMESTAMP NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        else:
            ddl = """
            CREATE TABLE product_sales_offers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                tenant_id INTEGER NOT NULL,
                product_id INTEGER NOT NULL,
                stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE',
                name VARCHAR(512) NOT NULL,
                sale_price_net NUMERIC(12, 2) NULL,
                is_default INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                outlet_damage_class VARCHAR(8) NULL,
                outlet_damage_reasons_json TEXT NULL,
                outlet_description TEXT NULL,
                deleted_at TIMESTAMP NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
                FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
            )
            """
        with engine.begin() as conn:
            conn.execute(text(ddl))
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_product_sales_offers_tenant_product "
                    "ON product_sales_offers(tenant_id, product_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_product_sales_offers_product_active "
                    "ON product_sales_offers(product_id, active)"
                )
            )
        logger.info("[product_sales_offers.3a] created product_sales_offers")

    _add_nullable_column(
        engine,
        "order_items",
        "product_sales_offer_id",
        "ALTER TABLE order_items ADD COLUMN product_sales_offer_id INTEGER NULL",
        "ALTER TABLE order_items ADD COLUMN product_sales_offer_id INTEGER NULL",
    )
    _add_nullable_column(
        engine,
        "order_items",
        "offer_name_snapshot",
        "ALTER TABLE order_items ADD COLUMN offer_name_snapshot VARCHAR(512) NULL",
        "ALTER TABLE order_items ADD COLUMN offer_name_snapshot VARCHAR(512) NULL",
    )
    _add_nullable_column(
        engine,
        "direct_sale_session_lines",
        "product_sales_offer_id",
        "ALTER TABLE direct_sale_session_lines ADD COLUMN product_sales_offer_id INTEGER NULL",
        "ALTER TABLE direct_sale_session_lines ADD COLUMN product_sales_offer_id INTEGER NULL",
    )
