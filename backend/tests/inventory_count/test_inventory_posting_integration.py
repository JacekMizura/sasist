"""Inventory posting integration — RW/PW StockDocument creation and status transitions."""

from __future__ import annotations

import unittest
from datetime import date

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.db.schema_upgrade import ensure_warehouse_inventory_movements_table
from backend.models.inventory import Inventory
from backend.models.location import Location
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_APPROVED,
    INV_STATUS_POSTED,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.product import Product
from backend.models.stock_document import StockDocument, StockDocumentItem
from backend.models.stock_operation import StockOperation
from backend.models.warehouse import Warehouse
from backend.services.inventory_count.adjustment_service import post_inventory_adjustments


class TestInventoryPostingIntegration(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        ensure_warehouse_inventory_movements_table(self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
        Warehouse.__table__.create(self.engine, checkfirst=True)
        Location.__table__.create(self.engine, checkfirst=True)
        Product.__table__.create(self.engine, checkfirst=True)
        StockDocument.__table__.create(self.engine, checkfirst=True)
        StockDocumentItem.__table__.create(self.engine, checkfirst=True)
        StockOperation.__table__.create(self.engine, checkfirst=True)
        Inventory.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine)

    def _approved_surplus_document(self, db) -> InventoryDocument:
        db.add(Warehouse(id=1, tenant_id=1, name="Magazyn 1"))
        db.add(Location(id=1, warehouse_id=1, name="A-01-01", is_active=True))
        db.add(
            Product(
                id=1,
                tenant_id=1,
                name="Test SKU",
                sku="SKU-1",
                ean="5900000000001",
                purchase_price=10.0,
            )
        )
        db.add(
            Inventory(
                tenant_id=1,
                warehouse_id=1,
                location_id=1,
                product_id=1,
                quantity=10.0,
                batch_number="",
                expiry_date=date(9999, 12, 31),
            )
        )
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number="INV-POST-INT",
            inventory_type=INV_TYPE_FULL,
            status=INV_STATUS_APPROVED,
            count_mode=COUNT_MODE_BLIND,
        )
        db.add(doc)
        db.flush()
        line = InventoryDocumentLine(
            inventory_document_id=doc.id,
            location_id=1,
            product_id=1,
            expected_quantity=10.0,
            counted_quantity=15.0,
            status=LINE_STATUS_COUNTED,
            metadata_json='{"snapshot_unit_cost_net": 10.0}',
        )
        line.recompute_difference()
        db.add(line)
        db.commit()
        db.refresh(doc)
        return doc

    def test_posting_creates_pw_updates_status_and_idempotent(self):
        with self.Session() as db:
            doc = self._approved_surplus_document(db)

            result = post_inventory_adjustments(
                db,
                tenant_id=1,
                document_id=int(doc.id),
                user_id=1,
                idempotency_key="post-int-1",
            )
            db.commit()
            db.refresh(doc)

            self.assertEqual(result["status"], INV_STATUS_POSTED)
            self.assertFalse(result.get("idempotent"))
            self.assertIsNotNone(doc.pw_stock_document_id)
            self.assertIsNone(doc.rw_stock_document_id)

            pw = db.query(StockDocument).filter(StockDocument.id == int(doc.pw_stock_document_id)).first()
            self.assertIsNotNone(pw)
            self.assertEqual(str(pw.document_type), "PW")
            self.assertEqual(str(pw.creation_source), "INVENTORY_COUNT")

            pw_lines = (
                db.query(StockDocumentItem)
                .filter(StockDocumentItem.document_id == int(pw.id))
                .all()
            )
            self.assertEqual(len(pw_lines), 1)
            self.assertEqual(float(pw_lines[0].quantity), 5.0)

            inv = (
                db.query(Inventory)
                .filter(
                    Inventory.tenant_id == 1,
                    Inventory.warehouse_id == 1,
                    Inventory.product_id == 1,
                    Inventory.location_id == 1,
                )
                .first()
            )
            self.assertIsNotNone(inv)
            self.assertEqual(float(inv.quantity), 15.0)

            repeat = post_inventory_adjustments(
                db,
                tenant_id=1,
                document_id=int(doc.id),
                user_id=1,
                idempotency_key="post-int-1",
            )
            self.assertTrue(repeat.get("idempotent"))


if __name__ == "__main__":
    unittest.main()
