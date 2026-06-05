"""
Phase 3 operational commerce — documents, reservations, pickup, series resolution.

  python -m pytest backend/tests/test_operational_sales_phase3.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.document_generation_job import JOB_PENDING
from backend.services.direct_sale.constants import (
    RESERVATION_STATUS_ACTIVE,
    RESERVATION_STATUS_CONSUMED,
    legacy_status_to_lifecycle,
    lifecycle_to_legacy_status,
)
from backend.services.documents.series_resolution_service import (
    SeriesResolutionContext,
    _rule_score,
)
from backend.services.operational_sales_events import build_event_payload


class TestReservationLifecycleMapping(unittest.TestCase):
    def test_legacy_reserved_is_active(self):
        self.assertEqual(legacy_status_to_lifecycle("reserved"), RESERVATION_STATUS_ACTIVE)

    def test_picked_is_consumed(self):
        self.assertEqual(legacy_status_to_lifecycle("picked"), RESERVATION_STATUS_CONSUMED)
        self.assertEqual(lifecycle_to_legacy_status(RESERVATION_STATUS_CONSUMED), "picked")


class TestEventEnvelope(unittest.TestCase):
    def test_payload_envelope(self):
        p = build_event_payload(
            "document.requested",
            tenant_id=1,
            warehouse_id=2,
            order_id=10,
            extra={"job_id": 5},
        )
        self.assertEqual(p["event"], "document.requested")
        self.assertEqual(p["version"], 1)
        self.assertEqual(p["tenant_id"], 1)
        self.assertIn("payload", p)
        self.assertIn("metadata", p)
        self.assertEqual(p["payload"]["job_id"], 5)


class TestSeriesRuleScoring(unittest.TestCase):
    def test_matching_rule_scores(self):
        rule = SimpleNamespace(
            priority=100,
            warehouse_id=1,
            organization_id=None,
            country_id=None,
            document_subtype="RECEIPT",
            order_channel="DIRECT_SALE",
            fulfillment_mode="IMMEDIATE",
            fiscal_profile=None,
            operational_zone=None,
        )
        ctx = SeriesResolutionContext(
            tenant_id=1,
            warehouse_id=1,
            document_type="SALE",
            document_subtype="RECEIPT",
            order_channel="DIRECT_SALE",
            fulfillment_mode="IMMEDIATE",
        )
        score = _rule_score(rule, ctx)
        self.assertNotEqual(score, -1)
        self.assertLess(score, 100)

    def test_mismatch_returns_negative(self):
        rule = SimpleNamespace(
            priority=100,
            warehouse_id=1,
            organization_id=None,
            country_id=None,
            document_subtype="INVOICE",
            order_channel=None,
            fulfillment_mode=None,
            fiscal_profile=None,
            operational_zone=None,
        )
        ctx = SeriesResolutionContext(
            tenant_id=1,
            warehouse_id=1,
            document_type="SALE",
            document_subtype="RECEIPT",
        )
        self.assertEqual(_rule_score(rule, ctx), -1)


class TestDocumentJobEnqueue(unittest.TestCase):
    @patch("backend.services.documents.generation_queue_service.emit_operational_sales_event")
    @patch("backend.services.documents.generation_queue_service.resolve_document_series")
    def test_enqueue_creates_pending_job(self, mock_series, _ev):
        from backend.services.documents.generation_queue_service import enqueue_document_job

        mock_series.return_value = SimpleNamespace(id="series-uuid-1")
        order = SimpleNamespace(id=10, tenant_id=1, warehouse_id=1, order_channel="DIRECT_SALE", fulfillment_mode="IMMEDIATE")
        db = MagicMock()
        db.add = MagicMock()
        db.flush = MagicMock(side_effect=lambda: setattr(db.add.call_args[0][0], "id", 77))

        with patch("backend.services.documents.generation_queue_service.DocumentGenerationJob") as JobCls:
            inst = SimpleNamespace(id=77)
            JobCls.return_value = inst
            with patch("backend.services.documents.generation_queue_service.series_context_from_order", return_value=SeriesResolutionContext(1, 1, "SALE", "RECEIPT")):
                result = enqueue_document_job(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    order_id=10,
                    session_id=9,
                    order=order,
                )
        self.assertEqual(result.job_id, 77)
        self.assertEqual(result.status, JOB_PENDING)


class TestReservationExpirationWorker(unittest.TestCase):
    @patch("backend.workers.reservation_expiration_worker.expire_reservation")
    def test_expire_due_reservations(self, mock_expire):
        from backend.workers.reservation_expiration_worker import expire_due_reservations

        res = SimpleNamespace(id=1, status="reserved", expires_at=datetime.utcnow() - timedelta(minutes=1))
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.limit.return_value.all.return_value = [res]
        count = expire_due_reservations(db)
        self.assertEqual(count, 1)
        mock_expire.assert_called_once()


class TestPickupFlowRequiresPickupMode(unittest.TestCase):
    def test_prepare_rejects_wms_order(self):
        from backend.services.direct_sale_service import DirectSaleError
        from backend.services.pickup.flow_service import start_pickup_prepare

        order = SimpleNamespace(id=1, tenant_id=1, warehouse_id=1, order_channel=None, fulfillment_mode=None)
        db = MagicMock()
        with patch("backend.services.pickup.flow_service.resolve_order_operational_mode") as mock_mode:
            mock_mode.return_value = SimpleNamespace(order_channel="ONLINE", fulfillment_mode="WMS")
            with self.assertRaises(DirectSaleError) as ctx:
                start_pickup_prepare(db, order=order)
            self.assertEqual(ctx.exception.code, "not_pickup_order")


if __name__ == "__main__":
    unittest.main()
