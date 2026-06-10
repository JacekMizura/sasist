"""Schema reconciliation edge cases — logging, orphans, phased FK."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text

from backend.db.schema_introspection import (
    get_table_column_names,
    sync_model_foreign_keys,
)
from backend.observability.platform_debug import log_schema_tier


class TestLogSchemaTierKwargs(unittest.TestCase):
    def test_accepts_reconcile_metrics(self):
        log_schema_tier(
            "schema.tier0",
            step="postgres_orm_reconcile",
            duration_ms=12.5,
            ok=True,
            columns_added=3,
            indexes_added=1,
            foreign_keys_added=2,
        )


class TestFkOrphanRepair(unittest.TestCase):
    def test_nulls_orphans_before_adding_fk(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE customers (id INTEGER PRIMARY KEY)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE direct_sale_sessions (
                        id INTEGER PRIMARY KEY,
                        customer_id INTEGER
                    )
                    """
                )
            )
            conn.execute(text("INSERT INTO direct_sale_sessions (id, customer_id) VALUES (1, 999)"))
            conn.execute(text("INSERT INTO direct_sale_sessions (id, customer_id) VALUES (2, NULL)"))

        from backend.models.commerce_operational import DirectSaleSession

        sync_model_foreign_keys(engine, DirectSaleSession, log_prefix="test.fk")

        with engine.connect() as conn:
            orphan = conn.execute(
                text("SELECT customer_id FROM direct_sale_sessions WHERE id = 1")
            ).scalar()
        self.assertIsNone(orphan)


if __name__ == "__main__":
    unittest.main()
