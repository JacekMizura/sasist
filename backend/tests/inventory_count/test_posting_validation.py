"""Pre-posting validation — operator SSOT, suspicious qty, stock preflight."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_APPROVED,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
)
from backend.models.inventory_count.count_entry import InventoryCountEntry
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory import Inventory
from backend.models.product import Product
from backend.services.inventory_count.errors import (
    InventoryInvalidTransitionError,
    InventoryPendingRecountsError,
    InventoryPostingFailedError,
)
from backend.services.inventory_count.posting_validation_service import (
    build_posting_line_snapshot,
    reconcile_line_counted_from_operators,
    validate_and_prepare_document_for_posting,
)


class TestPostingValidation(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))
        Product.__table__.create(self.engine, checkfirst=True)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS locations (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT OR IGNORE INTO locations (id) VALUES (1)"))
        Inventory.__table__.create(self.engine, checkfirst=True)

    def _approved_doc_with_line(
        self,
        db,
        *,
        expected: float = 10.0,
        counted: float | None = 10.0,
        product_id: int = 1,
    ) -> tuple[InventoryDocument, InventoryDocumentLine]:
        db.add(
            Product(
                id=product_id,
                tenant_id=1,
                name="Test SKU",
                sku="SKU-1",
                ean="5900000000001",
                units_per_carton=5,
            )
        )
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number="INV-VAL-1",
            inventory_type=INV_TYPE_FULL,
            status=INV_STATUS_APPROVED,
            count_mode=COUNT_MODE_BLIND,
        )
        db.add(doc)
        db.flush()
        line = InventoryDocumentLine(
            inventory_document_id=doc.id,
            location_id=1,
            product_id=product_id,
            expected_quantity=expected,
            counted_quantity=counted,
            status=LINE_STATUS_COUNTED,
        )
        line.recompute_difference()
        db.add(line)
        db.commit()
        db.refresh(doc)
        db.refresh(line)
        return doc, line

    def test_reconcile_single_operator_never_sums(self):
        with self.Session() as db:
            doc, line = self._approved_doc_with_line(db, counted=None)
            db.add(
                InventoryCountEntry(
                    inventory_document_line_id=line.id,
                    inventory_document_id=doc.id,
                    user_id=1,
                    counted_quantity=27.0,
                    delta_quantity=27.0,
                    source="manual",
                )
            )
            db.commit()
            db.refresh(line)

            changed = reconcile_line_counted_from_operators(db, line)
            self.assertTrue(changed)
            self.assertEqual(float(line.counted_quantity), 27.0)
            self.assertEqual(float(line.difference_quantity), 17.0)

            db.add(
                InventoryCountEntry(
                    inventory_document_line_id=line.id,
                    inventory_document_id=doc.id,
                    user_id=2,
                    counted_quantity=8.0,
                    delta_quantity=8.0,
                    source="manual",
                )
            )
            db.commit()
            reconcile_line_counted_from_operators(db, line)
            self.assertIsNone(line.counted_quantity)

    def test_operator_conflict_blocks_posting(self):
        with self.Session() as db:
            doc, line = self._approved_doc_with_line(db, counted=None)
            for uid, qty in ((1, 27.0), (2, 8.0)):
                db.add(
                    InventoryCountEntry(
                        inventory_document_line_id=line.id,
                        inventory_document_id=doc.id,
                        user_id=uid,
                        counted_quantity=qty,
                        delta_quantity=qty,
                        source="manual",
                    )
                )
            db.commit()

            with self.assertRaises(InventoryPendingRecountsError) as ctx:
                validate_and_prepare_document_for_posting(db, doc=doc)
            self.assertIn("never sum", str(ctx.exception).lower())

    def test_suspicious_quantity_blocks_posting(self):
        with self.Session() as db:
            doc, line = self._approved_doc_with_line(db, expected=10.0, counted=98676.0)
            db.add(
                InventoryCountEntry(
                    inventory_document_line_id=line.id,
                    inventory_document_id=doc.id,
                    user_id=1,
                    counted_quantity=98676.0,
                    delta_quantity=98676.0,
                    source="manual",
                )
            )
            db.commit()

            with self.assertRaises(InventoryInvalidTransitionError) as ctx:
                validate_and_prepare_document_for_posting(db, doc=doc)
            details = ctx.exception.details or {}
            self.assertTrue(details.get("suspicious_lines"))

    def test_line_snapshot_includes_carton_fields(self):
        with self.Session() as db:
            _, line = self._approved_doc_with_line(db, expected=10.0, counted=16.0)
            product = db.query(Product).filter(Product.id == 1).first()
            snapshot = build_posting_line_snapshot(db, line=line, product=product)
            self.assertEqual(snapshot["line_id"], line.id)
            self.assertEqual(snapshot["cartons"], 3)
            self.assertEqual(snapshot["carton_capacity"], 5)
            self.assertEqual(snapshot["pieces"], 1)
            self.assertEqual(snapshot["computed_total"], 16)
            self.assertEqual(snapshot["expected_qty"], 10.0)
            self.assertEqual(snapshot["delta_qty"], 6.0)

    def test_rw_preflight_insufficient_stock(self):
        with self.Session() as db:
            doc, line = self._approved_doc_with_line(db, expected=100.0, counted=50.0)
            line.recompute_difference()
            db.add(
                InventoryCountEntry(
                    inventory_document_line_id=line.id,
                    inventory_document_id=doc.id,
                    user_id=1,
                    counted_quantity=50.0,
                    delta_quantity=50.0,
                    source="manual",
                )
            )
            db.commit()

            with self.assertRaises(InventoryPostingFailedError) as ctx:
                validate_and_prepare_document_for_posting(db, doc=doc)
            self.assertIn("Insufficient stock", str(ctx.exception))
            self.assertEqual(ctx.exception.details.get("required_qty"), 50.0)


if __name__ == "__main__":
    unittest.main()
