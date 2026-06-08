"""Submit-for-approval validation — structured errors."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_IN_PROGRESS,
    INV_STATUS_PLANNED,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
    LINE_STATUS_OPEN,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.product import Product
from backend.services.inventory_count.approval_service import submit_for_approval
from backend.services.inventory_count.errors import (
    InventoryIncompleteCountError,
    InventoryInvalidTransitionError,
)
from backend.services.inventory_count.kpi_service import recompute_document_kpis


class TestSubmitApprovalValidation(unittest.TestCase):
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

    def _doc(self, db, *, status: str = INV_STATUS_IN_PROGRESS) -> InventoryDocument:
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number="INV-TEST-1",
            inventory_type=INV_TYPE_FULL,
            status=status,
            count_mode=COUNT_MODE_BLIND,
        )
        db.add(doc)
        db.flush()
        return doc

    def test_rejects_wrong_status_with_details(self):
        with self.Session() as db:
            doc = self._doc(db, status=INV_STATUS_PLANNED)
            db.commit()
            with self.assertRaises(InventoryInvalidTransitionError) as ctx:
                submit_for_approval(db, tenant_id=1, document_id=doc.id, user_id=1)
            err = ctx.exception
            self.assertEqual(err.code, "invalid_status_transition")
            self.assertEqual(err.details.get("document_status"), INV_STATUS_PLANNED)
            self.assertIn(INV_STATUS_IN_PROGRESS, err.details.get("allowed_statuses", []))

    def test_rejects_incomplete_count_with_details(self):
        with self.Session() as db:
            doc = self._doc(db)
            db.add(
                InventoryDocumentLine(
                    inventory_document_id=doc.id,
                    location_id=10,
                    product_id=5,
                    expected_quantity=10.0,
                    counted_quantity=10.0,
                    status=LINE_STATUS_COUNTED,
                )
            )
            db.add(
                InventoryDocumentLine(
                    inventory_document_id=doc.id,
                    location_id=11,
                    product_id=6,
                    expected_quantity=5.0,
                    status=LINE_STATUS_OPEN,
                )
            )
            db.commit()
            db.refresh(doc)
            recompute_document_kpis(db, doc)
            db.commit()

            with self.assertRaises(InventoryIncompleteCountError) as ctx:
                submit_for_approval(db, tenant_id=1, document_id=doc.id, user_id=1)
            err = ctx.exception
            self.assertEqual(err.code, "incomplete_count")
            self.assertEqual(err.details.get("counted_lines"), 1)
            self.assertEqual(err.details.get("total_lines"), 2)
            self.assertEqual(err.details.get("uncounted_lines"), 1)

    def test_success_when_all_lines_counted(self):
        with self.Session() as db:
            doc = self._doc(db)
            db.add(
                InventoryDocumentLine(
                    inventory_document_id=doc.id,
                    location_id=10,
                    product_id=5,
                    expected_quantity=10.0,
                    counted_quantity=10.0,
                    status=LINE_STATUS_COUNTED,
                )
            )
            db.commit()
            db.refresh(doc)
            recompute_document_kpis(db, doc)
            db.commit()

            result = submit_for_approval(db, tenant_id=1, document_id=doc.id, user_id=1)
            self.assertEqual(result["status"], INV_STATUS_AWAITING_APPROVAL)


if __name__ == "__main__":
    unittest.main()
