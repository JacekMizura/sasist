"""
Production execution Phase 1 — unified WMS workflow vocabulary and migrations.

  python -m pytest backend/tests/test_production_execution.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace

from backend.services.production_execution.constants import (
    BATCH_STATUS_TO_LEGACY_SUMMARY,
    execution_phase_for_status,
    normalize_order_status,
)
from backend.services.production_execution.status_migration import migrate_legacy_order_execution_statuses


class TestExecutionPhaseMapping(unittest.TestCase):
    def test_execution_phase_for_status(self):
        self.assertEqual(execution_phase_for_status("planned"), "collecting")
        self.assertEqual(execution_phase_for_status("collecting"), "collecting")
        self.assertEqual(execution_phase_for_status("in_progress"), "execute")
        self.assertIsNone(execution_phase_for_status("putaway"))
        self.assertIsNone(execution_phase_for_status("completed"))

    def test_batch_to_legacy_summary_covers_wms_phases(self):
        self.assertEqual(BATCH_STATUS_TO_LEGACY_SUMMARY["collecting"], "in_progress")
        self.assertEqual(BATCH_STATUS_TO_LEGACY_SUMMARY["putaway"], "in_progress")
        self.assertEqual(BATCH_STATUS_TO_LEGACY_SUMMARY["planned"], "planned")

    def test_normalize_order_status(self):
        self.assertEqual(normalize_order_status("collecting"), "collecting")
        self.assertEqual(normalize_order_status("unknown"), "planned")


class TestLegacyOrderStatusMigration(unittest.TestCase):
    def test_migrates_legacy_putaway_with_pw_to_completed(self):
        order = SimpleNamespace(
            status="putaway",
            rw_stock_document_id=99,
            pw_stock_document_id=100,
            collection_state_json=None,
            released_to_wms_at=None,
        )
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                filter=lambda *_a, **_k: SimpleNamespace(all=lambda: [order])
            ),
            flush=lambda: None,
        )
        count = migrate_legacy_order_execution_statuses(db)  # type: ignore[arg-type]
        self.assertEqual(count, 1)
        self.assertEqual(order.status, "completed")

    def test_migrates_legacy_putaway_without_pw_to_in_progress(self):
        order = SimpleNamespace(
            status="putaway",
            rw_stock_document_id=99,
            pw_stock_document_id=None,
            collection_state_json=None,
            released_to_wms_at=None,
        )
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                filter=lambda *_a, **_k: SimpleNamespace(all=lambda: [order])
            ),
            flush=lambda: None,
        )
        count = migrate_legacy_order_execution_statuses(db)  # type: ignore[arg-type]
        self.assertEqual(count, 1)
        self.assertEqual(order.status, "in_progress")

    def test_migrates_in_progress_with_collection_to_collecting(self):
        order = SimpleNamespace(
            status="in_progress",
            rw_stock_document_id=None,
            pw_stock_document_id=None,
            collection_state_json='{"tasks":[]}',
            released_to_wms_at=datetime.utcnow(),
        )
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                filter=lambda *_a, **_k: SimpleNamespace(all=lambda: [order])
            ),
            flush=lambda: None,
        )
        count = migrate_legacy_order_execution_statuses(db)  # type: ignore[arg-type]
        self.assertEqual(count, 1)
        self.assertEqual(order.status, "collecting")

    def test_idempotent_when_no_match(self):
        order = SimpleNamespace(
            status="planned",
            rw_stock_document_id=None,
            pw_stock_document_id=None,
            collection_state_json=None,
            released_to_wms_at=None,
        )
        db = SimpleNamespace(
            query=lambda _model: SimpleNamespace(
                filter=lambda *_a, **_k: SimpleNamespace(all=lambda: [order])
            ),
            flush=lambda: None,
        )
        self.assertEqual(migrate_legacy_order_execution_statuses(db), 0)  # type: ignore[arg-type]
        self.assertEqual(order.status, "planned")


class TestProductionPwPutawayParity(unittest.TestCase):
    """Production PW must enter the same WMS Rozlokowanie gate as PZ after Przyjęcie."""

    def test_production_pw_draft_allows_putaway_like_pz_after_receiving(self):
        from types import SimpleNamespace

        from backend.services.stock_document_service import doc_allows_wms_putaway, wms_putaway_queue_statuses

        pz_after_receiving = SimpleNamespace(document_type="PZ", status="draft", creation_source="")
        pw_after_production = SimpleNamespace(
            document_type="PW", status="draft", creation_source="PRODUCTION"
        )
        self.assertTrue(doc_allows_wms_putaway(pz_after_receiving))
        self.assertTrue(doc_allows_wms_putaway(pw_after_production))
        self.assertIn("draft", wms_putaway_queue_statuses())


if __name__ == "__main__":
    unittest.main()
