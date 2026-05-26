"""Tests for WMS operational task engine."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.wms_operational_task import (
    TASK_SHORTAGE_DECISION,
    TASK_SHORTAGE_RECOLLECT,
    TASK_WAITING_SUPPLY,
    queue_projection_for_task_type,
)
from backend.services.wms_operational_task_service import (
    dual_write_enabled,
    group_key_decision,
    group_key_recollect,
    group_key_waiting,
    sync_operational_tasks_for_order,
)


class QueueProjectionTests(unittest.TestCase):
    def test_queue_is_ui_only(self):
        self.assertEqual(queue_projection_for_task_type(TASK_SHORTAGE_DECISION), "DO_DECYZJI")
        self.assertEqual(queue_projection_for_task_type(TASK_SHORTAGE_RECOLLECT), "DO_DOGRYWKI")
        self.assertEqual(queue_projection_for_task_type(TASK_WAITING_SUPPLY), "OCZEKUJE_NA_DOSTAWE")


class GroupKeyTests(unittest.TestCase):
    def test_deterministic_keys(self):
        self.assertEqual(group_key_decision(1, 99), "decision:wh:1:oi:99")
        self.assertEqual(group_key_recollect(2, 88), "recollect:wh:2:oi:88")
        self.assertEqual(group_key_waiting(3, 77), "waiting:wh:3:prod:77")


class SyncOperationalTasksTests(unittest.TestCase):
    def test_creates_decision_task_for_unresolved_shortage(self):
        oi = SimpleNamespace(
            id=10,
            product_id=100,
            quantity=5,
            parent_bundle_order_item_id=None,
            oms_line_status=None,
            metadata_json=None,
            replaced_from_order_item_id=None,
            replaced_from_product_name=None,
        )
        order = SimpleNamespace(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            deleted_at=None,
            number="Z-1",
            items=[oi],
            cart_id=None,
        )

        db = MagicMock()
        added: list = []

        def fake_upsert(db, **kwargs):
            task = SimpleNamespace(
                id=1,
                **kwargs,
                status="open",
                quantity_done=0.0,
                payload_json="{}",
            )
            added.append(task)
            return task

        with (
            patch(
                "backend.services.wms_operational_task_service.compute_line_missing_qty",
                return_value=2.0,
            ),
            patch("backend.services.wms_operational_task_service._oms_waiting_for_stock", return_value=False),
            patch(
                "backend.services.wms_operational_task_service.order_item_needs_substitute_pick_completion",
                return_value=False,
            ),
            patch("backend.services.wms_operational_task_service._line_remaining_qty", return_value=0.0),
            patch("backend.services.wms_operational_task_service._location_label_for_product", return_value="A-1"),
            patch("backend.services.wms_operational_task_service._upsert_task", side_effect=fake_upsert),
            patch("backend.services.wms_operational_task_service._find_active_by_group_key", return_value=None),
        ):
            stale_q = MagicMock()
            stale_q.filter.return_value = stale_q
            stale_q.all.return_value = []
            db.query.return_value = stale_q
            keys = sync_operational_tasks_for_order(db, order)

        self.assertIn(group_key_decision(1, 10), keys)
        self.assertEqual(len(added), 1)
        self.assertEqual(added[0].task_type, TASK_SHORTAGE_DECISION)


class DualWriteFlagTests(unittest.TestCase):
    def test_default_enabled(self):
        with patch.dict("os.environ", {}, clear=False):
            self.assertTrue(dual_write_enabled())


if __name__ == "__main__":
    unittest.main()
