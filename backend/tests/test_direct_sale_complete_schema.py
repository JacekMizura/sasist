"""
Direct sale /complete — sale_documents schema must exist before generate_documents stage.

  python -m pytest backend/tests/test_direct_sale_complete_schema.py -q
"""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.schema_introspection import ensure_sale_documents_orm_columns
from backend.models.sale_document import SaleDocument


class TestDirectSaleCompleteSchema(unittest.TestCase):
    def test_ensure_complete_schema_adds_sale_documents_document_type_id(self):
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
                        series_type VARCHAR(24) NOT NULL DEFAULT 'SALE',
                        created_at DATETIME
                    )
                    """
                )
            )
        ensure_sale_documents_orm_columns(engine)
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(sale_documents)"))}
        self.assertIn("document_type_id", cols)

    def test_generate_documents_query_does_not_fail_after_schema_ensure(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY, tenant_id INTEGER)"))
            conn.execute(text("INSERT INTO warehouses (id, tenant_id) VALUES (1, 1)"))
            conn.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY, tenant_id INTEGER)"))
            conn.execute(text("INSERT INTO orders (id, tenant_id) VALUES (10, 1)"))
            conn.execute(
                text(
                    """
                    CREATE TABLE document_series (
                        id VARCHAR(36) PRIMARY KEY,
                        tenant_id INTEGER,
                        subtype VARCHAR(16)
                    )
                    """
                )
            )
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
                        series_type VARCHAR(24) NOT NULL DEFAULT 'SALE',
                        created_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    CREATE TABLE direct_sale_sessions (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
                        pipeline_status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
                        issue_strategy VARCHAR(32) DEFAULT 'STRICT_LOCATION',
                        reservation_scope VARCHAR(16) DEFAULT 'SESSION'
                    )
                    """
                )
            )

        ensure_sale_documents_orm_columns(engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            row = (
                db.query(SaleDocument)
                .filter(SaleDocument.order_id == 10)
                .order_by(SaleDocument.created_at.desc())
                .first()
            )
            self.assertIsNone(row)
        finally:
            db.close()


if __name__ == "__main__":
    unittest.main()
