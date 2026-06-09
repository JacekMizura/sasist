"""Conflicts endpoint resilience — NULL relations, legacy rows, safe serialization."""

from __future__ import annotations

import math
import unittest

from backend.api import inventory_count as inventory_count_api

from backend.models.inventory_count.constants import (
    COUNT_MODE_BLIND,
    INV_STATUS_IN_PROGRESS,
    INV_TYPE_FULL,
    LINE_STATUS_COUNTED,
    RECOUNT_STATE_REQUIRED,
)
from backend.models.inventory_count.count_entry import InventoryCountEntry
from backend.models.inventory_count.document import InventoryDocument
from backend.models.inventory_count.document_line import InventoryDocumentLine
from backend.models.inventory_count.recount import InventoryRecount
from backend.services.inventory_count.conflict_detail_service import list_document_conflicts

from backend.tests.inventory_count._conflicts_test_helpers import create_conflicts_test_engine


class TestConflictsEndpointResilience(unittest.TestCase):
    def test_api_imports_conflict_service(self):
        self.assertTrue(callable(getattr(inventory_count_api, "list_document_conflicts", None)))

    def setUp(self):
        self.engine, self.Session = create_conflicts_test_engine()

    def _base_conflict_doc(self, db) -> tuple[InventoryDocument, InventoryDocumentLine]:
        doc = InventoryDocument(
            tenant_id=1,
            warehouse_id=1,
            number="INV-CONF",
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
        db.add(
            InventoryCountEntry(
                inventory_document_line_id=line.id,
                inventory_document_id=doc.id,
                user_id=1,
                counted_quantity=10.0,
                delta_quantity=10.0,
                source="scanner",
            )
        )
        db.add(
            InventoryCountEntry(
                inventory_document_line_id=line.id,
                inventory_document_id=doc.id,
                user_id=2,
                counted_quantity=12.0,
                delta_quantity=2.0,
                source="scanner",
            )
        )
        db.commit()
        db.refresh(doc)
        db.refresh(line)
        return doc, line

    def test_happy_path_returns_200_payload(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["document_id"], doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            self.assertEqual(len(result["items"]), 1)
            item = result["items"][0]
            self.assertEqual(item["line_id"], line.id)
            self.assertEqual(item["recount_state"], RECOUNT_STATE_REQUIRED)
            self.assertEqual(len(item["operators"]), 2)

    def test_missing_operator_user_still_returns_item(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            db.add(
                InventoryCountEntry(
                    inventory_document_line_id=line.id,
                    inventory_document_id=doc.id,
                    user_id=999,
                    counted_quantity=11.0,
                    delta_quantity=1.0,
                    source="scanner",
                )
            )
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            names = {op["operator_name"] for op in result["items"][0]["operators"]}
            self.assertIn("Operator", names)

    def test_null_user_id_entry_uses_anonymous_operator(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            db.add(
                InventoryCountEntry(
                    inventory_document_line_id=line.id,
                    inventory_document_id=doc.id,
                    user_id=None,
                    counted_quantity=11.0,
                    delta_quantity=1.0,
                    source="scanner",
                )
            )
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            self.assertGreaterEqual(len(result["items"][0]["operators"]), 2)

    def test_deleted_product_skips_conflict_row(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            line.product_id = 99999
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 0)
            self.assertEqual(result["items"], [])

    def test_nan_quantities_sanitized(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            line.counted_quantity = float("nan")
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            item = result["items"][0]
            self.assertIsNone(item["counted_quantity"])
            for op in item["operators"]:
                self.assertFalse(math.isnan(op["quantity"]))

    def test_recount_without_resolution_still_serializes(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            db.add(
                InventoryRecount(
                    inventory_document_id=doc.id,
                    inventory_document_line_id=line.id,
                    status="open",
                    reason="operator_conflict",
                )
            )
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            item = result["items"][0]
            self.assertIsNotNone(item["recount_id"])
            self.assertEqual(item["recount_status"], "open")

    def test_carrier_with_missing_relation(self):
        with self.Session() as db:
            doc, line = self._base_conflict_doc(db)
            line.carrier_id = 99999
            db.commit()
            result = list_document_conflicts(db, tenant_id=1, document_id=doc.id)
            self.assertEqual(result["total_conflicts"], 1)
            self.assertIsNone(result["items"][0]["carrier_code"])


if __name__ == "__main__":
    unittest.main()
