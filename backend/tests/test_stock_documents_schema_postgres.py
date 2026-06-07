"""
stock_documents schema — full ORM sync at Tier 0 startup (PostgreSQL-safe).

  python -m pytest backend/tests/test_stock_documents_schema_postgres.py -q
"""

from __future__ import annotations

import os
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateColumn

from backend.db.schema_introspection import (
    ensure_stock_document_items_orm_columns,
    ensure_stock_documents_orm_columns,
    ensure_tier0_document_warehouse_schema,
)
from backend.models.stock_document import StockDocument, StockDocumentItem


def _compile_postgres_add_column(model, col_name: str) -> str:
    col = model.__table__.columns[col_name]
    engine = create_engine("postgresql://localhost/test")
    return str(CreateColumn(col).compile(dialect=engine.dialect)).upper()


class TestStockDocumentsPostgresTypes(unittest.TestCase):
    def test_document_series_id_compiles_to_varchar_not_datetime(self):
        sql = _compile_postgres_add_column(StockDocument, "document_series_id")
        self.assertIn("VARCHAR", sql)
        self.assertNotIn("DATETIME", sql)

    def test_document_number_compiles_on_postgres(self):
        sql = _compile_postgres_add_column(StockDocument, "document_number")
        self.assertIn("VARCHAR", sql)

    def test_direct_sale_link_columns_compile_on_postgres(self):
        sql_order = _compile_postgres_add_column(StockDocument, "order_id")
        self.assertIn("INTEGER", sql_order)
        sql_sale = _compile_postgres_add_column(StockDocument, "source_sale_document_id")
        self.assertIn("VARCHAR", sql_sale)
        sql_sess = _compile_postgres_add_column(StockDocument, "direct_sale_session_id")
        self.assertIn("INTEGER", sql_sess)

    def test_ensure_stock_documents_orm_columns_adds_document_series_id_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE stock_documents (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        document_type VARCHAR(32) NOT NULL DEFAULT 'PZ',
                        status VARCHAR(32) NOT NULL DEFAULT 'draft',
                        receiving_status VARCHAR(32) NOT NULL DEFAULT 'NEW',
                        putaway_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
                        relocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
                        currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
                        creation_source VARCHAR(16) NOT NULL DEFAULT 'PANEL',
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                    """
                )
            )
        ensure_stock_documents_orm_columns(engine)
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)"))}
        self.assertIn("document_series_id", cols)
        self.assertIn("document_number", cols)
        self.assertIn("order_id", cols)
        self.assertIn("source_sale_document_id", cols)
        self.assertIn("direct_sale_session_id", cols)

    def test_tier0_document_warehouse_schema_syncs_items_table(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE stock_documents (id INTEGER PRIMARY KEY, tenant_id INTEGER NOT NULL,
                        document_type VARCHAR(32) NOT NULL DEFAULT 'PZ', status VARCHAR(32) NOT NULL DEFAULT 'draft',
                        receiving_status VARCHAR(32) NOT NULL DEFAULT 'NEW',
                        putaway_status VARCHAR(32) NOT NULL DEFAULT 'NOT_STARTED',
                        relocation_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
                        currency VARCHAR(8) NOT NULL DEFAULT 'PLN',
                        creation_source VARCHAR(16) NOT NULL DEFAULT 'PANEL',
                        created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE stock_document_items (
                        id INTEGER PRIMARY KEY,
                        document_id INTEGER NOT NULL,
                        ordered_quantity REAL NOT NULL DEFAULT 0,
                        received_quantity REAL NOT NULL DEFAULT 0,
                        cartons_count INTEGER NOT NULL DEFAULT 0,
                        loose_units_count INTEGER NOT NULL DEFAULT 0,
                        quantity_putaway REAL NOT NULL DEFAULT 0,
                        quantity REAL NOT NULL DEFAULT 0,
                        vat_rate REAL NOT NULL DEFAULT 23.0,
                        batch_number VARCHAR(128) NOT NULL DEFAULT '',
                        expiry_date DATE NOT NULL,
                        stock_disposition VARCHAR(32) NOT NULL DEFAULT 'SALEABLE'
                    )
                    """
                )
            )
        ensure_tier0_document_warehouse_schema(engine)
        with engine.connect() as conn:
            doc_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_documents)"))}
            item_cols = {row[1] for row in conn.execute(text("PRAGMA table_info(stock_document_items)"))}
        self.assertIn("document_series_id", doc_cols)
        orm_item_cols = {c.key for c in StockDocumentItem.__table__.columns}
        self.assertTrue(orm_item_cols.issubset(item_cols), msg=sorted(orm_item_cols - item_cols))


@unittest.skipUnless(
    (os.environ.get("DATABASE_URL") or "").startswith("postgres"),
    "needs PostgreSQL DATABASE_URL",
)
class TestStockDocumentsPostgresLive(unittest.TestCase):
    def test_ensure_stock_documents_orm_columns_on_postgres(self):
        from backend.database import engine

        ensure_stock_documents_orm_columns(engine)
        with engine.connect() as conn:
            rows = conn.execute(
                text(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'stock_documents'
                    """
                )
            )
            cols = {row[0] for row in rows}
        if not cols:
            self.skipTest("stock_documents table missing")
        self.assertIn("document_series_id", cols)
        self.assertIn("document_number", cols)


if __name__ == "__main__":
    unittest.main()
