"""
Phase 4 operational runtime — replenishment, orchestration, live events.

  python -m pytest backend/tests/test_operational_runtime_phase4.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.wms_operational_task import ORCH_QUEUED, TASK_REPLENISHMENT
from backend.services.operational_features_context import OperationalFeaturesContext
from backend.services.orchestration.constants import VALID_TRANSITIONS
from backend.services.orchestration.lifecycle_service import init_orchestration_state, transition_task_state
from backend.services.replenishment.detection_service import evaluate_rule_for_product


def _ctx_runtime(*, runtime: bool = True, repl: bool = True) -> OperationalFeaturesContext:
    return OperationalFeaturesContext(
        tenant_id=1,
        warehouse_id=1,
        operational_sales=False,
        immediate_wms_exclusion=False,
        operational_sales_sessions=False,
        operational_runtime=runtime,
        replenishment_engine=repl,
        resolution_scope="test",
    )


class TestOrchestrationTransitions(unittest.TestCase):
    def test_queued_to_assigned_allowed(self):
        self.assertIn("ASSIGNED", VALID_TRANSITIONS[ORCH_QUEUED])

    def test_init_orchestration_state(self):
        task = SimpleNamespace(orchestration_state=None, status="open")
        init_orchestration_state(task, ORCH_QUEUED)
        self.assertEqual(task.orchestration_state, ORCH_QUEUED)


class TestReplenishmentDetection(unittest.TestCase):
    @patch("backend.services.replenishment.detection_service.publish_live_event")
    @patch("backend.services.replenishment.detection_service.upsert_replenishment_operational_task")
    def test_low_shelf_creates_task(self, mock_upsert, mock_publish):
        mock_upsert.return_value = SimpleNamespace(id=99)
        rule = SimpleNamespace(
            id=1,
            zone_type="SALES",
            task_type=TASK_REPLENISHMENT,
            min_qty=5.0,
            max_qty=None,
            target_qty=10.0,
            preferred_source_zone_type="BACKROOM",
            priority=60,
        )
        db = MagicMock()
        hit = evaluate_rule_for_product(
            db,
            tenant_id=1,
            warehouse_id=1,
            product_id=42,
            rule=rule,
            zone_qty={"SALES": 2.0, "BACKROOM": 40.0},
            features=_ctx_runtime(),
        )
        self.assertIsNotNone(hit)
        self.assertEqual(hit["product_id"], 42)
        mock_upsert.assert_called_once()
        mock_publish.assert_called_once()

    @patch("backend.services.replenishment.detection_service.create_operational_alert")
    def test_no_source_creates_alert(self, mock_alert):
        rule = SimpleNamespace(
            id=1,
            zone_type="SALES",
            task_type=TASK_REPLENISHMENT,
            min_qty=5.0,
            max_qty=None,
            target_qty=None,
            preferred_source_zone_type="BACKROOM",
            priority=50,
        )
        db = MagicMock()
        hit = evaluate_rule_for_product(
            db,
            tenant_id=1,
            warehouse_id=1,
            product_id=42,
            rule=rule,
            zone_qty={"SALES": 2.0},
            features=_ctx_runtime(),
        )
        self.assertIsNone(hit)
        mock_alert.assert_called_once()


class TestLivePublisherGated(unittest.TestCase):
    def test_publish_skipped_when_runtime_off(self):
        from backend.services.live.publisher import publish_live_event

        db = MagicMock()
        row = publish_live_event(
            db,
            tenant_id=1,
            warehouse_id=1,
            event_type="stock.changed",
            payload={"product_id": 1},
            features=_ctx_runtime(runtime=False),
        )
        self.assertIsNone(row)
        db.add.assert_not_called()


class TestTransitionTaskState(unittest.TestCase):
    @patch("backend.services.orchestration.lifecycle_service.publish_live_event")
    def test_transition_queued_to_assigned(self, _pub):
        task = SimpleNamespace(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            orchestration_state=ORCH_QUEUED,
            status="open",
            blocked_reason=None,
            completed_at=None,
        )
        db = MagicMock()
        transition_task_state(db, task, new_state="ASSIGNED")
        self.assertEqual(task.orchestration_state, "ASSIGNED")
        self.assertEqual(task.status, "in_progress")
