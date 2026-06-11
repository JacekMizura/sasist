"""
Z-PZ schema startup — legacy DB without Z-PZ columns → migrate → API 200.

Simulates PostgreSQL deploy drift: ORM expects Z-PZ columns, physical table does not.
"""

from __future__ import annotations

import unittest
from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from backend.db.z_pz_schema import (
    ensure_z_pz_schema,
    log_z_pz_schema_verification,
    verify_z_pz_schema,
)
from backend.db.schema_introspection import get_table_column_names
from backend.models.stock_document import StockDocument


def _create_legacy_stock_schema(conn) -> None:
    """Minimal pre-Z-PZ stock_documents / items (no Z-PZ columns)."""
    conn.execute(
        text(
            """
            CREATE TABLE tenants (id INTEGER PRIMARY KEY)
            """
        )
    )
    conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
    conn.execute(
        text(
            """
            CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL)
            """
        )
    )
    conn.execute(text("INSERT INTO warehouses (id, tenant_id) VALUES (1, 1)"))
    conn.execute(
        text(
            """
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                name VARCHAR(512) NOT NULL DEFAULT '',
                sku VARCHAR(128),
                symbol VARCHAR(128),
                ean VARCHAR(64),
                weight REAL DEFAULT 0,
                volume REAL DEFAULT 0,
                length REAL DEFAULT 0,
                width REAL DEFAULT 0,
                height REAL DEFAULT 0,
                purchase_price REAL,
                deleted_at DATETIME
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO products (id, tenant_id, name, purchase_price)
            VALUES (10, 1, 'Test product', 5.0)
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE orders (
                id INTEGER PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                warehouse_id INTEGER NOT NULL,
                number VARCHAR(64),
                status VARCHAR(32) DEFAULT 'NEW',
                city VARCHAR(128),
                country VARCHAR(128),
                value REAL,
                created_at DATETIME
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO orders (id, tenant_id, warehouse_id, number, created_at)
            VALUES (42, 1, 1, '42', :now)
            """
        ),
        {"now": datetime.utcnow()},
    )
    conn.execute(
        text(
            """
            CREATE TABLE order_items (
                id INTEGER PRIMARY KEY,
                order_id INTEGER NOT NULL,
                product_id INTEGER,
                quantity INTEGER DEFAULT 1,
                unit_price REAL,
                total_price REAL
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO order_items (id, order_id, product_id, quantity, unit_price, total_price)
            VALUES (1, 42, 10, 1, 9.99, 9.99)
            """
        )
    )
    conn.execute(
        text(
            """
            CREATE TABLE stock_documents (
                id INTEGER PRIMARY KEY,
                tenant_id INTEGER NOT NULL,
                warehouse_id INTEGER,
                document_type VARCHAR(32) NOT NULL DEFAULT 'PZ',
                status VARCHAR(32) NOT NULL DEFAULT 'posted',
                receiving_status VARCHAR(32) NOT NULL DEFAULT 'DONE',
                putaway_status VARCHAR(32) NOT NULL DEFAULT 'DONE',
                relocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
                currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
                creation_source VARCHAR(16) NOT NULL DEFAULT 'PANEL',
                created_at DATETIME NOT NULL,
                updated_at DATETIME NOT NULL
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO stock_documents (
                id, tenant_id, warehouse_id, document_type, status, created_at, updated_at
            ) VALUES (1, 1, 1, 'PZ', 'posted', :now, :now)
            """
        ),
        {"now": datetime.utcnow()},
    )
    conn.execute(
        text(
            """
            CREATE TABLE stock_document_items (
                id INTEGER PRIMARY KEY,
                document_id INTEGER NOT NULL,
                product_id INTEGER,
                ordered_quantity REAL NOT NULL DEFAULT 0,
                received_quantity REAL NOT NULL DEFAULT 0,
                quantity REAL NOT NULL DEFAULT 0,
                vat_rate REAL NOT NULL DEFAULT 23.0,
                batch_number VARCHAR(128) NOT NULL DEFAULT '',
                expiry_date DATE NOT NULL DEFAULT '9999-12-31',
                stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE'
            )
            """
        )
    )
    conn.execute(
        text(
            """
            INSERT INTO stock_document_items (
                id, document_id, product_id, ordered_quantity, received_quantity, quantity
            ) VALUES (1, 1, 10, 1, 1, 1)
            """
        )
    )


class TestZPzSchemaStartup(unittest.TestCase):
    def test_ensure_z_pz_schema_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            _create_legacy_stock_schema(conn)

        missing_before = verify_z_pz_schema(engine)
        self.assertIn("stock_documents.source_rmz_ids_json", missing_before)

        added = ensure_z_pz_schema(engine)
        self.assertGreaterEqual(added, 1)
        self.assertEqual(verify_z_pz_schema(engine, include_extended=False), [])

        added_again = ensure_z_pz_schema(engine)
        self.assertEqual(added_again, 0)

    def test_log_z_pz_schema_verification_ok(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            _create_legacy_stock_schema(conn)
        ensure_z_pz_schema(engine)
        missing = log_z_pz_schema_verification(engine)
        self.assertEqual(missing, [])

    def test_stock_document_orm_query_after_migration(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            _create_legacy_stock_schema(conn)
        ensure_z_pz_schema(engine)

        db = Session(bind=engine)
        try:
            doc = db.query(StockDocument).filter(StockDocument.id == 1).first()
            self.assertIsNotNone(doc)
            self.assertIn("source_rmz_ids_json", get_table_column_names(engine, "stock_documents"))
        finally:
            db.close()

    def test_product_cost_pz_lookup_after_z_pz_migration(self):
        """Same StockDocument ORM join as product_cost_service._latest_posted_pz_unit_for_product."""
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            _create_legacy_stock_schema(conn)
        ensure_z_pz_schema(engine)

        from backend.models.stock_document import StockDocumentItem

        db = Session(bind=engine)
        try:
            doc = (
                db.query(StockDocument)
                .join(StockDocumentItem, StockDocumentItem.document_id == StockDocument.id)
                .filter(
                    StockDocument.tenant_id == 1,
                    StockDocument.document_type == "PZ",
                    StockDocumentItem.product_id == 10,
                    StockDocumentItem.received_quantity > 1e-9,
                    StockDocument.status == "posted",
                )
                .order_by(StockDocument.updated_at.desc(), StockDocument.id.desc())
                .first()
            )
            self.assertIsNotNone(doc)
            self.assertEqual(int(doc.id), 1)
        finally:
            db.close()

    def test_stock_documents_list_query_after_z_pz_migration(self):
        """Same ORM path as GET /api/stock-documents/."""
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            _create_legacy_stock_schema(conn)
        ensure_z_pz_schema(engine)
        self.assertEqual(verify_z_pz_schema(engine, include_extended=False), [])

        db = Session(bind=engine)
        try:
            rows = db.query(StockDocument).filter(StockDocument.tenant_id == 1).all()
            self.assertGreaterEqual(len(rows), 1)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
