"""Recount conflict detection — operator disagreement only."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.inventory_count_schema import ensure_inventory_count_schema
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
from backend.services.inventory_count.approval_service import evaluate_submit_readiness
from backend.services.inventory_count.difference_service import classify_line_difference
from backend.services.inventory_count.kpi_service import recompute_document_kpis
from backend.services.inventory_count.recount_conflict_service import (
    build_document_count_conflicts,
    has_operator_count_conflict,
    resolve_line_recount_state,
)


class TestRecountConflictLogic(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite:///:memory:")
        ensure_inventory_count_schema(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        with self.engine.begin() as conn:
            conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("INSERT INTO tenants (id) VALUES (1)"))
            conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY, code VARCHAR(16))"))
            conn.execute(text("INSERT INTO warehouses (id, code) VALUES (1, 'WH1')"))

    def test_variance_does_not_imply_mandatory_recount(self):
        th = {"auto_approve_percent": 1.0, "supervisor_review_percent": 5.0, "mandatory_recount_percent": 10.0}
        self.assertEqual(classify_line_difference(expected=100, counted=50, thresholds=th), "supervisor_review")
        self.assertEqual(classify_line_difference(expected=0, counted=10, thresholds=th), "supervisor_review")

    def test_operator_conflict_detection(self):
        self.assertFalse(has_operator_count_conflict({1: 10.0, 2: 10.0}))
        self.assertTrue(has_operator_count_conflict({1: 10.0, 2: 12.0}))

    def test_submit_allowed_with_inventory_difference_only(self):
        with self.Session() as db:
            doc = InventoryDocument(
                tenant_id=1,
                warehouse_id=1,
                number="INV-DIFF",
                inventory_type=INV_TYPE_FULL,
                status=INV_STATUS_IN_PROGRESS,
                count_mode=COUNT_MODE_BLIND,
            )
            db.add(doc)
            db.flush()
            db.add(
                InventoryDocumentLine(
                    inventory_document_id=doc.id,
                    location_id=10,
                    product_id=5,
                    expected_quantity=100.0,
                    counted_quantity=80.0,
                    status=LINE_STATUS_COUNTED,
                )
            )
            db.commit()
            db.refresh(doc)
            recompute_document_kpis(db, doc)
            db.commit()

            readiness = evaluate_submit_readiness(db, doc)
            self.assertTrue(readiness["can_submit"], readiness)
            self.assertIsNone(readiness.get("block_code"))

    def test_submit_blocked_on_operator_conflict(self):
        with self.Session() as db:
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
            db.refresh(line)

            conflicts = build_document_count_conflicts(db, document_id=doc.id)
            self.assertEqual(len(conflicts), 1)
            self.assertEqual(resolve_line_recount_state(db, line=line, document_conflicts=conflicts), RECOUNT_STATE_REQUIRED)

            readiness = evaluate_submit_readiness(db, doc)
            self.assertFalse(readiness["can_submit"])
            self.assertEqual(readiness["block_code"], "pending_recounts")


if __name__ == "__main__":
    unittest.main()
