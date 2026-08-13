"""
Production schema — create missing required tables (Railway PostgreSQL hotfix).

Reproduces: production_order_source_items missing → skip → startup gate crash.

  python -m pytest backend/tests/test_production_source_items_schema_create.py -q
"""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.schema import CreateTable

from backend.db.production_schema import (
    ensure_production_concurrency_indexes,
    ensure_production_schema_evolution,
    run_production_schema_audit,
    run_production_schema_startup_gate,
    sync_production_registered_models,
)
from backend.db.schema_introspection import ensure_model_table_from_orm, has_table
from backend.models.production import ProductionOrderSourceItem
from backend.platform_state import clear_production_schema_valid


def _fk_stubs(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS stock_documents (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS order_ui_statuses (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS picking_configs (id INTEGER PRIMARY KEY)"))


def _legacy_batches_and_orders_without_source_items(engine) -> None:
    """Old production DB: batches + orders exist, Phase-1 source table does not."""
    _fk_stubs(engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE production_batches (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL,
                    number VARCHAR(64) NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'draft',
                    notes TEXT,
                    rw_stock_document_id INTEGER,
                    created_by_user_id INTEGER,
                    started_at DATETIME,
                    completed_at DATETIME,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE production_orders (
                    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
                    tenant_id INTEGER NOT NULL,
                    number VARCHAR(64) NOT NULL,
                    recipe_id INTEGER,
                    composition_id INTEGER,
                    product_id INTEGER NOT NULL,
                    warehouse_id INTEGER NOT NULL,
                    location_id INTEGER,
                    planned_quantity FLOAT NOT NULL DEFAULT 0,
                    produced_quantity FLOAT NOT NULL DEFAULT 0,
                    status VARCHAR(32) NOT NULL DEFAULT 'draft',
                    notes TEXT,
                    rw_stock_document_id INTEGER,
                    pw_stock_document_id INTEGER,
                    created_by_user_id INTEGER,
                    started_at DATETIME,
                    completed_at DATETIME,
                    created_at DATETIME NOT NULL,
                    updated_at DATETIME NOT NULL,
                    source_type VARCHAR(16) NOT NULL DEFAULT 'MANUAL'
                )
                """
            )
        )


class TestPostgresDdlPathForSourceItems(unittest.TestCase):
    def test_create_table_ddl_compiles_for_postgresql(self):
        dialect = create_engine("postgresql://localhost/test").dialect
        ddl = str(CreateTable(ProductionOrderSourceItem.__table__).compile(dialect=dialect)).upper()
        self.assertIn("PRODUCTION_ORDER_SOURCE_ITEMS", ddl)
        self.assertIn("TENANT_ID", ddl)
        self.assertIn("PRODUCTION_ORDER_ID", ddl)
        self.assertIn("ORDER_ITEM_ID", ddl)
        self.assertIn("REQUESTED_QUANTITY", ddl)
        self.assertIn("FULFILLED_QUANTITY", ddl)
        self.assertIn("STATUS", ddl)
        self.assertIn("UQ_PROD_ORDER_SOURCE_MO_ORDER_ITEM", ddl)
        self.assertIn("TIMESTAMP", ddl)
        self.assertNotIn("DATETIME", ddl)

    def test_ensure_model_table_from_orm_creates_when_missing(self):
        engine = create_engine("sqlite:///:memory:")
        _fk_stubs(engine)
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE production_orders (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        number VARCHAR(64) NOT NULL,
                        product_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        planned_quantity FLOAT NOT NULL DEFAULT 0,
                        produced_quantity FLOAT NOT NULL DEFAULT 0,
                        status VARCHAR(32) NOT NULL DEFAULT 'draft',
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                    """
                )
            )
        self.assertFalse(has_table(engine, "production_order_source_items"))
        self.assertTrue(
            ensure_model_table_from_orm(engine, ProductionOrderSourceItem, log_prefix="test")
        )
        self.assertTrue(has_table(engine, "production_order_source_items"))
        self.assertFalse(
            ensure_model_table_from_orm(engine, ProductionOrderSourceItem, log_prefix="test")
        )


class TestMissingSourceItemsStartupGate(unittest.TestCase):
    def setUp(self) -> None:
        clear_production_schema_valid()

    def test_old_db_without_source_items_passes_startup_gate(self):
        engine = create_engine("sqlite:///:memory:")
        _legacy_batches_and_orders_without_source_items(engine)
        self.assertFalse(has_table(engine, "production_order_source_items"))

        result = run_production_schema_startup_gate(engine, phase="test_missing_source")
        self.assertTrue(has_table(engine, "production_order_source_items"))

        insp = inspect(engine)
        cols = {c["name"] for c in insp.get_columns("production_order_source_items")}
        for required in (
            "id",
            "tenant_id",
            "production_order_id",
            "order_id",
            "order_item_id",
            "product_id",
            "requested_quantity",
            "fulfilled_quantity",
            "status",
            "created_at",
            "updated_at",
        ):
            self.assertIn(required, cols)

        report = run_production_schema_audit(engine)
        self.assertNotIn("production_order_source_items", report.missing_tables)
        self.assertEqual(
            [m for m in report.missing_columns if m["table"] == "production_order_source_items"],
            [],
        )

        # Idempotent second run
        result2 = run_production_schema_startup_gate(engine, phase="test_missing_source_2")
        self.assertEqual(result2.get("dialect"), "sqlite")
        self.assertTrue(has_table(engine, "production_order_source_items"))

    def test_sync_creates_required_table_instead_of_skip(self):
        engine = create_engine("sqlite:///:memory:")
        _legacy_batches_and_orders_without_source_items(engine)
        self.assertFalse(has_table(engine, "production_order_source_items"))
        sync_production_registered_models(engine, strict=True)
        self.assertTrue(has_table(engine, "production_order_source_items"))
        ensure_production_concurrency_indexes(engine)

        idx_names = {ix["name"] for ix in inspect(engine).get_indexes("production_order_source_items")}
        # Partial unique from ensure_production_concurrency_indexes (SQLite supports WHERE).
        self.assertIn("uq_prod_source_active_order_item", idx_names)


class TestEvolutionCreatesSourceItems(unittest.TestCase):
    def test_ensure_evolution_from_legacy_batches(self):
        engine = create_engine("sqlite:///:memory:")
        _legacy_batches_and_orders_without_source_items(engine)
        out = ensure_production_schema_evolution(engine)
        self.assertTrue(has_table(engine, "production_order_source_items"))
        self.assertNotIn("production_order_source_items", out["audit"]["missing_tables"])


if __name__ == "__main__":
    unittest.main()
