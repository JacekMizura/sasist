"""WMS active inventory documents — operator list excludes drafts/closed."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_APPROVED,
    INV_STATUS_AWAITING_APPROVAL,
    INV_STATUS_CANCELLED,
    INV_STATUS_DRAFT,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
    INV_TYPE_PARTIAL,
)
from backend.models.inventory_count.document import InventoryDocument
from backend.services.inventory_count.wms_active_documents_service import list_wms_active_inventory_documents


class TestWmsActiveInventoryDocuments(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))

    def _add_doc(self, db, *, number: str, status: str, title: str | None = None) -> InventoryDocument:
        meta = f'{{"title": "{title}"}}' if title else None
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number=number,
            inventory_type=INV_TYPE_PARTIAL if "PART" in number else INV_TYPE_FULL,
            status=status,
            count_mode=COUNT_MODE_BLIND,
            filters_json='{"scope_mode":"full"}',
            metadata_json=meta,
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc

    def test_lists_only_in_progress_and_awaiting_approval(self):
        with self.Session() as db:
            self._add_doc(db, number="INV-DRAFT", status=INV_STATUS_DRAFT)
            in_prog = self._add_doc(db, number="INV-PROG", status=INV_STATUS_IN_PROGRESS, title="Liczenie A")
            awaiting = self._add_doc(
                db, number="INV-WAIT", status=INV_STATUS_AWAITING_APPROVAL, title="Do zatwierdzenia"
            )
            self._add_doc(db, number="INV-APPR", status=INV_STATUS_APPROVED)
            self._add_doc(db, number="INV-CANC", status=INV_STATUS_CANCELLED)

            rows = list_wms_active_inventory_documents(db, tenant_id=1, warehouse_id=1)

        numbers = {r["number"] for r in rows}
        self.assertEqual(numbers, {"INV-PROG", "INV-WAIT"})
        by_num = {r["number"]: r for r in rows}
        self.assertTrue(by_num["INV-PROG"]["can_count"])
        self.assertFalse(by_num["INV-WAIT"]["can_count"])
        self.assertEqual(by_num["INV-PROG"]["scope_summary"], "Cały magazyn")
        self.assertIn("operator_count", by_num["INV-PROG"])
        self.assertIn("conflict_count", by_num["INV-PROG"])

    def test_other_warehouse_excluded(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=99,
                number="INV-OTHER-WH",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.commit()
            rows = list_wms_active_inventory_documents(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(rows, [])


if __name__ == "__main__":
    unittest.main()
