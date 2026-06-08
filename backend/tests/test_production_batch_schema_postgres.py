"""
production_batches schema — dialect-safe ORM sync (PostgreSQL + SQLite).

  python -m pytest backend/tests/test_production_batch_schema_postgres.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateColumn

from backend.db.schema_introspection import (
    audit_orm_table_columns,
    ensure_production_batches_orm_columns,
    sync_production_batch_orm_columns,
)
from backend.db.schema_upgrade import ensure_production_batch_schema_sync
from backend.models.product_composition import ProductionBatch


def _compile_postgres_add_column(model, col_name: str) -> str:
    col = model.__table__.columns[col_name]
    engine = create_engine("postgresql://localhost/test")
    return str(CreateColumn(col).compile(dialect=engine.dialect)).upper()


def _legacy_production_batches_sqlite() -> str:
    """Simulates older DB — no WMS workflow columns."""
    return """
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


class TestProductionBatchPostgresTypes(unittest.TestCase):
    def test_collection_state_json_compiles_to_text(self):
        sql = _compile_postgres_add_column(ProductionBatch, "collection_state_json")
        self.assertIn("TEXT", sql)
        self.assertNotIn("DATETIME", sql)

    def test_collecting_completed_at_compiles_to_timestamp_not_datetime(self):
        sql = _compile_postgres_add_column(ProductionBatch, "collecting_completed_at")
        self.assertIn("TIMESTAMP", sql)
        self.assertNotIn("DATETIME", sql)

    def test_production_completed_at_compiles_to_timestamp_not_datetime(self):
        sql = _compile_postgres_add_column(ProductionBatch, "production_completed_at")
        self.assertIn("TIMESTAMP", sql)
        self.assertNotIn("DATETIME", sql)


class TestProductionBatchSchemaSync(unittest.TestCase):
    def test_sync_adds_workflow_columns_on_legacy_sqlite_table(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))

        audit_before = audit_orm_table_columns(engine, ProductionBatch)
        self.assertIn("collection_state_json", audit_before["missing_in_db"])
        self.assertIn("collecting_completed_at", audit_before["missing_in_db"])
        self.assertIn("production_completed_at", audit_before["missing_in_db"])

        added = ensure_production_batch_schema_sync(engine)
        self.assertGreaterEqual(added, 3)

        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(production_batches)"))}
        self.assertIn("collection_state_json", cols)
        self.assertIn("collecting_completed_at", cols)
        self.assertIn("production_completed_at", cols)

        audit_after = audit_orm_table_columns(engine, ProductionBatch)
        self.assertEqual(audit_after["missing_in_db"], [])

    def test_sync_is_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        first = sync_production_batch_orm_columns(engine)
        second = sync_production_batch_orm_columns(engine)
        self.assertGreaterEqual(first, 3)
        self.assertEqual(second, 0)

    def test_batch_row_insert_includes_workflow_columns_after_sync(self):
        """Regression: INSERT must succeed once workflow columns exist (PostgreSQL drift fix)."""
        engine = create_engine("sqlite:///:memory:")
        now = datetime.utcnow()
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))

        ensure_production_batch_schema_sync(engine)

        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO production_batches (
                        tenant_id, number, warehouse_id, status,
                        collection_state_json, collecting_completed_at, production_completed_at,
                        created_at, updated_at
                    ) VALUES (
                        1, 'BAT/2026/0001', 1, 'planned',
                        NULL, NULL, NULL,
                        :now, :now
                    )
                    """
                ),
                {"now": now},
            )
            row = conn.execute(
                text(
                    "SELECT collection_state_json, collecting_completed_at, production_completed_at "
                    "FROM production_batches WHERE number = 'BAT/2026/0001'"
                )
            ).one()
        self.assertIsNone(row[0])
        self.assertIsNone(row[1])
        self.assertIsNone(row[2])


if __name__ == "__main__":
    unittest.main()
