"""
Customer CRM columns — NOT NULL backfill on populated ``customers`` table.

Simulates PostgreSQL deploy drift: existing rows, new NOT NULL ORM columns without server_default.
"""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text

from backend.db.schema_introspection import get_table_column_names, sync_model_schema
from backend.models.customer import Customer


class TestCustomerCrmSchemaSync(unittest.TestCase):
    def test_not_null_columns_backfill_on_populated_table(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE customers (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        first_name VARCHAR(128) NOT NULL DEFAULT '',
                        last_name VARCHAR(128) NOT NULL DEFAULT '',
                        country_code VARCHAR(8) NOT NULL DEFAULT 'PL',
                        default_document_type VARCHAR(16) NOT NULL DEFAULT 'RECEIPT',
                        global_discount_percent FLOAT NOT NULL DEFAULT 0.0
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO customers (id, tenant_id, first_name, last_name)
                    VALUES (1, 1, 'Jan', 'Kowalski')
                    """
                )
            )

        result = sync_model_schema(
            engine,
            Customer,
            log_prefix="test.customer.schema",
            sync_indexes=True,
            sync_foreign_keys=False,
        )
        self.assertGreaterEqual(result.columns_added, 2)

        cols = get_table_column_names(engine, "customers")
        self.assertIn("customer_type", cols)
        self.assertIn("customer_status", cols)

        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT customer_type, customer_status FROM customers WHERE id = 1"
                )
            ).one()
        self.assertEqual(row.customer_type, "retail")
        self.assertEqual(row.customer_status, "active")

    def test_customer_crm_sync_is_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE customers (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        first_name VARCHAR(128) NOT NULL DEFAULT '',
                        last_name VARCHAR(128) NOT NULL DEFAULT '',
                        country_code VARCHAR(8) NOT NULL DEFAULT 'PL',
                        default_document_type VARCHAR(16) NOT NULL DEFAULT 'RECEIPT',
                        global_discount_percent FLOAT NOT NULL DEFAULT 0.0
                    )
                    """
                )
            )
            conn.execute(
                text("INSERT INTO customers (id, tenant_id) VALUES (1, 1)")
            )

        first = sync_model_schema(
            engine,
            Customer,
            log_prefix="test.customer.schema",
            sync_indexes=True,
            sync_foreign_keys=False,
        )
        self.assertGreaterEqual(first.columns_added, 2)

        second = sync_model_schema(
            engine,
            Customer,
            log_prefix="test.customer.schema.repeat",
            sync_indexes=True,
            sync_foreign_keys=False,
        )
        self.assertEqual(second.columns_added, 0)


if __name__ == "__main__":
    unittest.main()
