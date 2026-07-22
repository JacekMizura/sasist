"""
Cross-module regression: missing requires_putaway / default_requires_putaway → WMS list 500.

Reproduces prod-class failure after ba0dc357 when startup ensure used PG-unsafe
``BOOLEAN DEFAULT 1`` and left ORM columns absent.

Affected (full entity SELECT):
  GET /wms/receiving/pz
  GET /wms/putaway/pz
  GET /wms/returns/active-z-pz

Not affected (COUNT only):
  warehouse-operations snapshot StockDocument counts

  python -m pytest backend/tests/wms/test_requires_putaway_schema_drift_lists.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import MagicMock

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from backend.db.schema_introspection import get_table_column_names
from backend.db.schema_upgrade import (
    _bool_col_default,
    ensure_stock_document_item_requires_putaway_column,
    ensure_stock_document_putaway_flag_schema,
)
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.returns.collective_z_pz_service import get_active_collective_z_pz_summary
from backend.services.wms_putaway_service import list_wms_putaway_pz_documents
from backend.services.wms_receiving_service import list_wms_receiving_pz_documents


def _strip_putaway_flag_columns(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE stock_documents RENAME TO stock_documents_full"))
        cols = [c["name"] for c in inspect(engine).get_columns("stock_documents_full")]
        keep = [c for c in cols if c != "default_requires_putaway"]
        col_defs = ", ".join(f'"{c}"' for c in keep)
        conn.execute(text(f"CREATE TABLE stock_documents AS SELECT {col_defs} FROM stock_documents_full"))
        conn.execute(text("DROP TABLE stock_documents_full"))

        conn.execute(text("ALTER TABLE stock_document_items RENAME TO stock_document_items_full"))
        cols = [c["name"] for c in inspect(engine).get_columns("stock_document_items_full")]
        keep = [c for c in cols if c != "requires_putaway"]
        col_defs = ", ".join(f'"{c}"' for c in keep)
        conn.execute(
            text(f"CREATE TABLE stock_document_items AS SELECT {col_defs} FROM stock_document_items_full")
        )
        conn.execute(text("DROP TABLE stock_document_items_full"))
    assert "default_requires_putaway" not in get_table_column_names(engine, "stock_documents")
    assert "requires_putaway" not in get_table_column_names(engine, "stock_document_items")


class TestRequiresPutawaySchemaDrift(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        Tenant.__table__.create(self.engine, checkfirst=True)
        Warehouse.__table__.create(self.engine, checkfirst=True)
        StockDocument.__table__.create(self.engine, checkfirst=True)
        StockDocumentItem.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine)
        db = self.Session()
        db.add(Tenant(id=1, name="T"))
        db.add(Warehouse(id=1, tenant_id=1, name="WH", requires_putaway=True))
        db.add(
            StockDocument(
                id=1,
                tenant_id=1,
                warehouse_id=1,
                document_type="PZ",
                status="draft",
                receiving_status="IN_PROGRESS",
                putaway_status="NOT_STARTED",
                relocation_status="OPEN",
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow(),
            )
        )
        db.commit()
        db.close()
        _strip_putaway_flag_columns(self.engine)

    def test_pg_bool_default_uses_true_not_integer(self):
        eng = MagicMock()
        eng.dialect.name = "postgresql"
        self.assertEqual(_bool_col_default(eng, default_true=True), "BOOLEAN NOT NULL DEFAULT true")
        eng.dialect.name = "sqlite"
        self.assertEqual(_bool_col_default(eng, default_true=True), "BOOLEAN NOT NULL DEFAULT 1")

    def test_orm_select_fails_without_columns(self):
        db = self.Session()
        with self.assertRaises(Exception):
            db.query(StockDocument).filter(StockDocument.tenant_id == 1).all()
        db.close()

    def test_ensure_heals_and_lists_succeed(self):
        ensure_stock_document_item_requires_putaway_column(self.engine)
        self.assertIn("default_requires_putaway", get_table_column_names(self.engine, "stock_documents"))
        self.assertIn("requires_putaway", get_table_column_names(self.engine, "stock_document_items"))

        db = self.Session()
        ensure_stock_document_putaway_flag_schema(db)
        rows = list_wms_receiving_pz_documents(db, 1, warehouse_id=1)
        self.assertIsInstance(rows, list)
        putaway_rows = list_wms_putaway_pz_documents(db, 1, warehouse_id=1)
        self.assertIsInstance(putaway_rows, list)
        series = MagicMock()
        series.id = "s1"
        series.collective_return_receipt = True
        z = get_active_collective_z_pz_summary(db, tenant_id=1, warehouse_id=1, series=series)
        self.assertIsNone(z)
        db.close()


if __name__ == "__main__":
    unittest.main()
