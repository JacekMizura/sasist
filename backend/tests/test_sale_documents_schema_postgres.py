"""
sale_documents schema — PostgreSQL-safe timestamp types; startup sync only.

  python -m pytest backend/tests/test_sale_documents_schema_postgres.py -q
"""

from __future__ import annotations

import inspect
import os
import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateColumn

from backend.db.schema_introspection import ensure_sale_documents_orm_columns
from backend.models.sale_document import SaleDocument
from backend.services.direct_sale import complete_service


def _compile_postgres_add_column(col_name: str) -> str:
    col = SaleDocument.__table__.columns[col_name]
    engine = create_engine("postgresql://localhost/test")
    return str(CreateColumn(col).compile(dialect=engine.dialect)).upper()


class TestSaleDocumentsPostgresTypes(unittest.TestCase):
    def test_payment_captured_at_compiles_to_timestamp_not_datetime(self):
        sql = _compile_postgres_add_column("payment_captured_at")
        self.assertIn("TIMESTAMP", sql)
        self.assertNotIn("DATETIME", sql)

    def test_created_at_compiles_to_timestamp_not_datetime(self):
        sql = _compile_postgres_add_column("created_at")
        self.assertIn("TIMESTAMP", sql)
        self.assertNotIn("DATETIME", sql)

    def test_ensure_orm_columns_adds_payment_captured_at_on_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE sale_documents (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        document_series_id VARCHAR(36) NOT NULL,
                        document_number VARCHAR(128) NOT NULL,
                        panel_document_type VARCHAR(16) NOT NULL,
                        series_type VARCHAR(24) NOT NULL DEFAULT 'SALE'
                    )
                    """
                )
            )
        ensure_sale_documents_orm_columns(engine)
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(sale_documents)"))}
        self.assertIn("payment_captured_at", cols)
        self.assertIn("document_type_id", cols)

    def test_legacy_datetime_alter_would_fail_on_postgres_compile(self):
        bad = "ALTER TABLE sale_documents ADD COLUMN payment_captured_at DATETIME"
        compiled = bad.upper()
        self.assertIn("DATETIME", compiled)
        good_col = _compile_postgres_add_column("payment_captured_at")
        self.assertNotIn("DATETIME", good_col)

    def test_complete_service_does_not_run_schema_migrations(self):
        source = inspect.getsource(complete_service)
        self.assertNotIn("_ensure_direct_sale_complete_schema", source)
        self.assertNotIn("ensure_sale_documents_extended_columns", source)
        self.assertNotIn("schema_upgrade", source)


@unittest.skipUnless(
    (os.environ.get("DATABASE_URL") or "").startswith("postgres"),
    "needs PostgreSQL DATABASE_URL",
)
class TestSaleDocumentsPostgresLive(unittest.TestCase):
    def test_ensure_orm_columns_succeeds_on_postgres(self):
        from backend.database import engine

        added = ensure_sale_documents_orm_columns(engine)
        cols = set()
        with engine.connect() as conn:
            insp_rows = conn.execute(
                text(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'sale_documents'
                    """
                )
            )
            cols = {row[0] for row in insp_rows}
        if not cols:
            self.skipTest("sale_documents table missing")
        self.assertIn("payment_captured_at", cols)
        self.assertGreaterEqual(added, 0)


if __name__ == "__main__":
    unittest.main()
