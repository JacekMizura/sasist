"""
Phase 2 operational sales — atomic complete, issue plan, events.

  python -m pytest backend/tests/test_operational_sales_phase2.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.direct_sale.errors import DirectSaleError
from backend.services.direct_sale.issue_plan_service import IssueAllocation, plan_issue_allocations
from backend.services.operational_sales_events import build_event_payload, emit_operational_sales_event
from backend.services.warehouse_inventory_movement_service import MOVEMENT_ISSUE, ALLOWED_MOVEMENT_TYPES


class TestMovementIssueType(unittest.TestCase):
    def test_issue_movement_allowed(self):
        self.assertIn(MOVEMENT_ISSUE, ALLOWED_MOVEMENT_TYPES)


class TestIssuePlanStrictLocation(unittest.TestCase):
    @patch("backend.services.direct_sale.issue_plan_service._available_at_location", return_value=5.0)
    def test_strict_uses_source_location(self, _avail):
        sess = SimpleNamespace(
            tenant_id=1,
            warehouse_id=1,
            issue_strategy="STRICT_LOCATION",
        )
        line = SimpleNamespace(id=10, product_id=5, quantity=2.0, source_location_id=22)
        db = MagicMock()
        out = plan_issue_allocations(db, sess, [line])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0], IssueAllocation(10, 5, 22, 2.0))

    @patch("backend.services.direct_sale.issue_plan_service._available_at_location", return_value=1.0)
    def test_strict_fails_insufficient(self, _avail):
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="STRICT_LOCATION")
        line = SimpleNamespace(id=10, product_id=5, quantity=2.0, source_location_id=22)
        with self.assertRaises(DirectSaleError) as ctx:
            plan_issue_allocations(MagicMock(), sess, [line])
        self.assertEqual(ctx.exception.code, "insufficient_stock")


class TestIssuePlanAutoSplit(unittest.TestCase):
    @patch("backend.services.direct_sale.issue_plan_service.suggest_issue_locations_for_sales")
    def test_auto_split_multiple_locations(self, mock_suggest):
        mock_suggest.return_value = [
            {"location_id": 1, "suggested_qty": 1.0},
            {"location_id": 2, "suggested_qty": 1.0},
        ]
        sess = SimpleNamespace(tenant_id=1, warehouse_id=1, issue_strategy="AUTO_SPLIT")
        line = SimpleNamespace(id=10, product_id=5, quantity=2.0, source_location_id=None)
        out = plan_issue_allocations(MagicMock(), sess, [line])
        self.assertEqual(len(out), 2)
        self.assertEqual(out[0].location_id, 1)
        self.assertEqual(out[1].location_id, 2)


class TestOperationalEventsPersist(unittest.TestCase):
    def test_emit_persists_row(self):
        db = MagicMock()
        payload = emit_operational_sales_event(
            db,
            "direct_sale.started",
            tenant_id=1,
            warehouse_id=1,
            session_id=9,
            source="direct_sales",
        )
        self.assertEqual(payload["event"], "direct_sale.started")
        db.add.assert_called_once()
        db.flush.assert_called_once()

    def test_build_payload_has_version(self):
        p = build_event_payload("payment.completed", tenant_id=1, order_id=15, qty=2)
        self.assertEqual(p["version"], 1)
        self.assertEqual(p["order_id"], 15)


class TestCompleteIdempotency(unittest.TestCase):
    def test_completed_session_returns_existing_result(self):
        from backend.services.direct_sale.complete_service import try_idempotent_complete_result

        sess = SimpleNamespace(
            id=7,
            tenant_id=1,
            warehouse_id=1,
            status="COMPLETED",
            order_id=100,
            completed_at=None,
            lines=[],
            expires_at=None,
            last_activity_at=None,
        )
        order = SimpleNamespace(id=100, tenant_id=1, value=42.0, sales_document_number="PA/1")
        pay = SimpleNamespace(id=300, order_id=100, tenant_id=1, status="PAID", method="CASH")
        doc_job = SimpleNamespace(id=55, session_id=7, tenant_id=1, result_json='{"document_number":"PA/1"}')

        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.order_by.return_value = q
            if model.__name__ == "Payment":
                q.first.side_effect = [pay, None]
            elif model.__name__ == "Order":
                q.first.return_value = order
            elif model.__name__ == "DocumentGenerationJob":
                q.first.return_value = doc_job
            else:
                q.first.return_value = None
            return q

        db.query.side_effect = query_side
        out = try_idempotent_complete_result(db, sess)
        self.assertIsNotNone(out)
        self.assertEqual(out.order_id, 100)
        self.assertEqual(out.payment_id, 300)
        self.assertEqual(out.total_amount, 42.0)


class TestCompletePipelineOrder(unittest.TestCase):
    @patch("backend.services.direct_sale.complete_service.run_staged_complete_pipeline")
    def test_complete_delegates_to_staged_pipeline(self, mock_pipeline):
        from backend.services.direct_sale.pipeline_orchestrator import StageEntities
        from backend.services.direct_sale.complete_service import complete_direct_sale_session

        mock_pipeline.return_value = StageEntities(
            order_id=100,
            payment_id=300,
            document_job_id=55,
            document_number="PA1",
            stock_document_id=901,
        )

        line = SimpleNamespace(
            id=10, product_id=5, quantity=1.0, unit_price=10.0, discount_amount=0.0, sort_order=0
        )
        sess = SimpleNamespace(
            id=9,
            tenant_id=1,
            warehouse_id=1,
            status="CHECKOUT",
            pipeline_status="PAYMENT_STARTED",
            pipeline_state_json=None,
            pipeline_failed_stage=None,
            order_id=None,
            lines=[line],
            issue_strategy="STRICT_LOCATION",
            reservation_scope="SESSION",
            workstation_id=None,
        )
        pay = SimpleNamespace(id=300, status="PAID", method="CASH")
        order = SimpleNamespace(id=100, value=10.0)
        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            name = getattr(model, "__name__", "")
            if name == "Payment":
                q.first.return_value = pay
            elif name == "Order":
                q.first.return_value = order
            else:
                q.first.return_value = None
            return q

        db.query.side_effect = query_side
        result = complete_direct_sale_session(db, sess, performed_by_user_id=7)
        self.assertEqual(result.order_id, 100)
        self.assertEqual(result.payment_id, 300)
        mock_pipeline.assert_called_once()


if __name__ == "__main__":
    unittest.main()
