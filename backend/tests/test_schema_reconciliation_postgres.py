"""
ORM schema reconciliation — user_activity_logs.warehouse_id on PostgreSQL-like drift.

  python -m pytest backend/tests/test_schema_reconciliation_postgres.py -q
"""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text

from backend.db.schema_introspection import get_table_column_names, sync_model_schema
from backend.db.schema_reconciliation import reconcile_orm_schema
from backend.models.user_activity_log import UserActivityLog


class TestUserActivityLogSchemaReconciliation(unittest.TestCase):
    def test_sync_adds_warehouse_id_and_session_id(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE user_activity_logs (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER,
                        tenant_id INTEGER,
                        action_type VARCHAR(96) NOT NULL,
                        module VARCHAR(64) NOT NULL,
                        entity_type VARCHAR(80),
                        entity_id INTEGER,
                        metadata_json TEXT,
                        created_at DATETIME NOT NULL
                    )
                    """
                )
            )

        result = sync_model_schema(
            engine,
            UserActivityLog,
            log_prefix="test.schema",
            sync_indexes=True,
            sync_foreign_keys=False,
        )
        self.assertGreaterEqual(result.columns_added, 2)

        cols = get_table_column_names(engine, "user_activity_logs")
        self.assertIn("warehouse_id", cols)
        self.assertIn("session_id", cols)

    def test_reconcile_orm_schema_is_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE user_activity_logs (
                        id INTEGER PRIMARY KEY,
                        user_id INTEGER,
                        tenant_id INTEGER,
                        action_type VARCHAR(96) NOT NULL,
                        module VARCHAR(64) NOT NULL,
                        created_at DATETIME NOT NULL
                    )
                    """
                )
            )

        first = reconcile_orm_schema(engine, phase="test", create_missing_tables=False)
        self.assertGreaterEqual(first.columns_added, 1)

        second = reconcile_orm_schema(engine, phase="test_repeat", create_missing_tables=False)
        self.assertEqual(second.columns_added, 0)
        self.assertEqual(second.tables_created, 0)


if __name__ == "__main__":
    unittest.main()
