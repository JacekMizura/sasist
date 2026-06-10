"""Customer CRM architecture — type/channel split and legacy migration."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text

from backend.db.schema_introspection import get_table_column_names, sync_model_schema
from backend.models.customer import Customer
from backend.services.customers.customer_constants import (
    normalize_customer_type,
    normalize_sales_channel,
    parse_customer_flags,
    resolve_customer_type_input,
)
from backend.services.customers.customer_data_migration import migrate_customer_crm_legacy_values


class TestCustomerCrmConstants(unittest.TestCase):
    def test_legacy_type_normalization(self):
        self.assertEqual(normalize_customer_type("b2b"), "wholesale")
        self.assertEqual(normalize_customer_type("marketplace"), "retail")
        self.assertEqual(normalize_customer_type("retail"), "retail")

    def test_resolve_marketplace_sets_flag(self):
        ctype, flags = resolve_customer_type_input("marketplace")
        self.assertEqual(ctype, "retail")
        self.assertTrue(flags.get("marketplace"))

    def test_sales_channel_default(self):
        self.assertEqual(normalize_sales_channel(None), "store")
        self.assertEqual(normalize_sales_channel("allegro"), "allegro")


class TestCustomerLegacyMigration(unittest.TestCase):
    def test_b2b_and_markplace_migrated_idempotently(self):
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
                        global_discount_percent FLOAT NOT NULL DEFAULT 0.0,
                        customer_type VARCHAR(32) NOT NULL DEFAULT 'retail',
                        customer_status VARCHAR(32) NOT NULL DEFAULT 'active',
                        sales_channel VARCHAR(32) NOT NULL DEFAULT 'store',
                        flags_json TEXT
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO customers (id, tenant_id, customer_type, sales_channel)
                    VALUES
                        (1, 1, 'b2b', 'store'),
                        (2, 1, 'marketplace', 'store')
                    """
                )
            )

        first = migrate_customer_crm_legacy_values(engine)
        self.assertEqual(first, 2)
        second = migrate_customer_crm_legacy_values(engine)
        self.assertEqual(second, 0)

        with engine.connect() as conn:
            b2b = conn.execute(
                text("SELECT customer_type, sales_channel FROM customers WHERE id = 1")
            ).one()
            mp = conn.execute(
                text("SELECT customer_type, sales_channel, flags_json FROM customers WHERE id = 2")
            ).one()
        self.assertEqual(b2b.customer_type, "wholesale")
        self.assertEqual(b2b.sales_channel, "b2b_portal")
        self.assertEqual(mp.customer_type, "retail")
        self.assertEqual(mp.sales_channel, "marketplace_other")
        flags = parse_customer_flags(mp.flags_json)
        self.assertTrue(flags.get("marketplace"))


class TestSalesChannelSchemaSync(unittest.TestCase):
    def test_sync_adds_sales_channel(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
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
                        global_discount_percent FLOAT NOT NULL DEFAULT 0.0,
                        customer_type VARCHAR(32) NOT NULL DEFAULT 'retail',
                        customer_status VARCHAR(32) NOT NULL DEFAULT 'active'
                    )
                    """
                )
            )
            conn.execute(text("INSERT INTO customers (id, tenant_id) VALUES (1, 1)"))

        sync_model_schema(engine, Customer, sync_foreign_keys=False)
        cols = get_table_column_names(engine, "customers")
        self.assertIn("sales_channel", cols)


if __name__ == "__main__":
    unittest.main()
