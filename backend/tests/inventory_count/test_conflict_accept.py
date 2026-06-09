"""Supervisor accept of operator count — no recount task."""

from __future__ import annotations

import unittest

from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
    RECOUNT_STATE_REQUIRED,
    RECOUNT_STATE_RESOLVED,
)
from backend.models.inventory_count.count_entry import InventoryCountEntry
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.recount import InventoryRecount
from backend.services.inventory_count.conflict_detail_service import list_document_conflicts
from backend.services.inventory_count.conflict_resolution_service import (
    accept_operator_count_entry,
    reject_operator_count_entry,
)

from backend.tests.inventory_count._conflicts_test_helpers import create_conflicts_test_engine


class TestConflictAccept(unittest.TestCase):
    def setUp(self):
        self.engine, self.Session = create_conflicts_test_engine()

    def _conflict_setup(self, db) -> tuple[InventoryDocument, InventoryDocumentLine, InventoryCountEntry, InventoryCountEntry]:
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number="INV-ACCEPT",
            inventory_type=INV_TYPE_FULL,
            status=INV_STATUS_IN_PROGRESS,
            count_mode=COUNT_MODE_BLIND,
        )
        db.add(doc)
        db.flush()
        line = InventoryDocumentLine(
            inventory_document_id=doc.id,
            location_id=10,
            product_id=5,
            expected_quantity=100.0,
            counted_quantity=12.0,
            status=LINE_STATUS_COUNTED,
        )
        db.add(line)
        db.flush()
        entry_a = InventoryCountEntry(
            inventory_document_line_id=line.id,
            inventory_document_id=doc.id,
            user_id=1,
            counted_quantity=10.0,
            delta_quantity=10.0,
            source="scanner",
        )
        entry_b = InventoryCountEntry(
            inventory_document_line_id=line.id,
            inventory_document_id=doc.id,
            user_id=2,
            counted_quantity=35.0,
            delta_quantity=25.0,
            source="scanner",
        )
        db.add(entry_a)
        db.add(entry_b)
        db.commit()
        db.refresh(doc)
        db.refresh(line)
        db.refresh(entry_a)
        db.refresh(entry_b)
        return doc, line, entry_a, entry_b

    def test_accept_sets_line_qty_and_removes_conflict_without_recount(self):
        with self.Session() as db:
            doc, line, _entry_a, entry_b = self._conflict_setup(db)
            before = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(before["total_conflicts"], 1)
            self.assertEqual(before["items"][0]["conflict_status"], "conflict_open")
            self.assertEqual(len(before["items"][0]["counts"]), 2)

            result = accept_operator_count_entry(
                db,
                tenant_id=1,
                document_id=doc.id,
                line_id=line.id,
                count_entry_id=entry_b.id,
                user_id=99,
            )
            db.commit()

            self.assertEqual(result["counted_quantity"], 35.0)
            self.assertEqual(result["conflict_status"], "conflict_resolved_manual")

            db.refresh(line)
            self.assertEqual(float(line.counted_quantity), 35.0)

            recounts = db.query(InventoryRecount).filter(InventoryRecount.inventory_document_line_id == line.id).all()
            self.assertEqual(recounts, [])

            after = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(after["total_conflicts"], 0)

    def test_grouped_counts_include_count_id_and_diff_label(self):
        with self.Session() as db:
            doc, _line, _a, _b = self._conflict_setup(db)
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            item = result["items"][0]
            self.assertEqual(item["quantity_diff_label"], "10 ↔ 35")
            self.assertEqual(len(item["counts"]), 2)
            count_ids = {c["count_id"] for c in item["counts"]}
            self.assertEqual(len(count_ids), 2)
            self.assertEqual(item["conflict_status"], "conflict_open")

    def test_accept_marks_conflict_resolved_in_state(self):
        with self.Session() as db:
            doc, line, entry_a, _entry_b = self._conflict_setup(db)
            accept_operator_count_entry(
                db,
                tenant_id=1,
                document_id=doc.id,
                line_id=line.id,
                count_entry_id=entry_a.id,
                user_id=1,
            )
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 0)


    def test_reject_marks_count_rejected_keeps_conflict_open(self):
        with self.Session() as db:
            doc, line, entry_a, entry_b = self._conflict_setup(db)
            reject_operator_count_entry(
                db,
                tenant_id=1,
                document_id=doc.id,
                line_id=line.id,
                count_entry_id=entry_a.id,
                user_id=1,
            )
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            item = result["items"][0]
            self.assertEqual(item["conflict_status"], "conflict_open")
            rejected = [c for c in item["counts"] if c["count_id"] == entry_a.id]
            self.assertTrue(rejected[0]["rejected"])


if __name__ == "__main__":
    unittest.main()
