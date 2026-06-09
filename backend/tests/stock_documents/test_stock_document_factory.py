"""StockDocument factory — column validation."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.models.stock_document import StockDocument
from backend.services.stock_document_factory import (
    create_stock_document,
    filter_stock_document_kwargs,
    stock_document_column_names,
)


class TestStockDocumentFactory(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO warehouses (id) VALUES (1)"))
        StockDocument.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine)

    def test_column_names_include_core_fields(self):
        cols = stock_document_column_names()
        self.assertIn("tenant_id", cols)
        self.assertIn("document_type", cols)
        self.assertNotIn("notes", cols)

    def test_filter_rejects_unknown_kwargs(self):
        valid, invalid = filter_stock_document_kwargs(
            tenant_id=1,
            warehouse_id=1,
            document_type="RW",
            notes="legacy field",
        )
        self.assertEqual(invalid, ["notes"])
        self.assertEqual(valid["document_type"], "RW")

    def test_create_raises_on_invalid_kwargs(self):
        with self.Session() as db:
            with self.assertRaises(TypeError) as ctx:
                create_stock_document(
                    db,
                    context="test",
                    tenant_id=1,
                    warehouse_id=1,
                    document_type="PW",
                    notes="bad",
                )
            self.assertIn("notes", str(ctx.exception))

    def test_create_persists_valid_document(self):
        with self.Session() as db:
            doc = create_stock_document(
                db,
                context="test",
                tenant_id=1,
                warehouse_id=1,
                document_type="PW",
                creation_source="INVENTORY_COUNT",
                status="completed",
            )
            db.commit()
            self.assertIsNotNone(doc.id)
            self.assertEqual(doc.document_type, "PW")


if __name__ == "__main__":
    unittest.main()
