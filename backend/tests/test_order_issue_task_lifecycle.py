"""
Lifecycle Braki — idempotentny upsert, deduplikacja, task_items.

  python -m pytest backend/tests/test_order_issue_task_lifecycle.py -q
"""

from __future__ import annotations

import json
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.order_issue_task import OrderIssueTask
from backend.services.order_issue_task_lifecycle import (
    ACTIVE_SHORTAGE_TASK_STATUSES,
    upsert_operational_shortage_task,
)


class UpsertOperationalShortageTaskTests(unittest.TestCase):
    def _order(self, oid: int = 500) -> SimpleNamespace:
        oi = SimpleNamespace(
            id=501,
            product_id=77,
            quantity=2.0,
            replaced_from_order_item_id=None,
            oms_line_status=None,
        )
        return SimpleNamespace(
            id=oid,
            tenant_id=1,
            warehouse_id=1,
            items=[oi],
            deleted_at=None,
        )

    def test_upsert_updates_existing_task_not_duplicate(self):
        order = self._order()
        existing = OrderIssueTask(
            id=9001,
            tenant_id=1,
            warehouse_id=1,
            order_id=500,
            type="SHORTAGE",
            status="OPEN",
            missing_items="[]",
            picked_items="[]",
            baseline_order_lines_json="{}",
            logs_json="[]",
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db = MagicMock()
        q = MagicMock()
        q.filter.return_value = q
        q.order_by.return_value = q
        q.first.return_value = existing
        q.all.return_value = []
        q.with_for_update.return_value = q
        db.query.return_value = q

        missing = [{"order_item_id": 501, "product_id": 77, "quantity_missing": 1.0}]
        picked = [{"order_item_id": 501, "product_id": 77, "quantity_picked": 1.0}]
        baseline = {"501": 2.0}

        with (
            patch(
                "backend.services.order_issue_task_lifecycle.ensure_order_issue_task_lifecycle_schema",
            ),
            patch(
                "backend.services.order_issue_task_lifecycle.build_full_issue_payload_for_order",
                return_value=(missing, picked, baseline),
            ),
            patch(
                "backend.services.order_issue_task_lifecycle._store_task_priority",
            ),
            patch(
                "backend.services.order_issue_task_lifecycle.sync_task_items_from_order",
                return_value=[1],
            ),
            patch(
                "backend.services.order_issue_task_lifecycle.recompute_task_aggregate_from_items",
            ),
            patch(
                "backend.services.order_issue_task_lifecycle._consolidate_duplicates_for_order",
                return_value=existing,
            ),
        ):
            task_id = upsert_operational_shortage_task(
                db,
                tenant_id=1,
                warehouse_id=1,
                order=order,
                shortage_product_id=77,
            )
        self.assertEqual(task_id, 9001)
        self.assertEqual(existing.type, "SHORTAGE")
        self.assertIn("quantity_missing", existing.missing_items)
        db.add.assert_not_called()

    def test_active_statuses_include_in_progress(self):
        self.assertIn("IN_PROGRESS", ACTIVE_SHORTAGE_TASK_STATUSES)
        self.assertIn("WAITING_RECOVERY", ACTIVE_SHORTAGE_TASK_STATUSES)


class ReportShortageWiresLifecycleTests(unittest.TestCase):
    def test_report_shortage_calls_lifecycle_upsert(self):
        from backend.services.wms_picking_product_list_service import upsert_order_issue_tasks_from_shortage

        with patch(
            "backend.services.order_issue_task_lifecycle.upsert_operational_shortage_tasks_for_orders",
            return_value=[42],
        ) as mock:
            ids = upsert_order_issue_tasks_from_shortage(
                MagicMock(),
                tenant_id=1,
                warehouse_id=1,
                order_ids=[500],
                shortage_product_id=77,
                source_picking_cart_id=9,
                source_operator_id=3,
            )
        self.assertEqual(ids, [42])
        mock.assert_called_once()
        kw = mock.call_args.kwargs
        self.assertEqual(kw["source_picking_cart_id"], 9)
        self.assertEqual(kw["source_operator_id"], 3)


if __name__ == "__main__":
    unittest.main()
