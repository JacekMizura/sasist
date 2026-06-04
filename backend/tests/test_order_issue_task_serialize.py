"""
Serializacja karty braków — brak NameError przy oms_wait / waiting stock.

  python -m pytest backend/tests/test_order_issue_task_serialize.py -q
"""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.api.wms_order_issue_tasks import serialize_order_issue_task_item


class TestOrderIssueTaskSerialize(unittest.TestCase):
    def test_serialize_does_not_reference_undefined_order(self):
        task = SimpleNamespace(
            id=7,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            type="MIXED",
            status="OPEN",
            missing_items="[]",
            picked_items="[]",
            logs_json="[]",
            created_at=datetime(2026, 6, 4, 12, 0, 0),
        )
        order = SimpleNamespace(
            id=100,
            number="Z-100",
            status="processing",
            tenant_id=1,
            warehouse_id=1,
            order_ui_status=None,
            items=[],
            customer=None,
            addresses_json="{}",
        )
        db = MagicMock()

        with (
            patch(
                "backend.api.wms_order_issue_tasks.compute_recommended_action",
                return_value="awaiting",
            ),
            patch(
                "backend.api.wms_order_issue_tasks.compute_ui_decision",
                return_value=("awaiting", []),
            ),
            patch(
                "backend.api.wms_order_issue_tasks.count_issue_queue_operational_lines",
                return_value=(1, 0),
            ),
            patch(
                "backend.api.wms_order_issue_tasks.braki_queue_bucket",
                return_value="awaiting_oms",
            ),
            patch(
                "backend.api.wms_order_issue_tasks.resolve_braki_workflow_status",
                return_value="awaiting",
            ),
            patch(
                "backend.services.wms_recovery_pick_service.order_has_waiting_customer_line",
                return_value=False,
            ),
            patch(
                "backend.services.braki_order_state_service.order_has_waiting_for_stock_lines",
                return_value=True,
            ),
            patch(
                "backend.api.wms_order_issue_tasks.build_order_issue_detail_context",
                return_value={
                    "collected_lines": [],
                    "shortage_decision_lines": [],
                    "remaining_pick_lines": [],
                },
            ),
            patch(
                "backend.api.wms_order_issue_tasks.build_shortage_lines_for_order",
                return_value=[],
            ),
            patch(
                "backend.api.wms_order_issue_tasks.first_pending_substitute_product",
                return_value=(0, ""),
            ),
        ):
            item = serialize_order_issue_task_item(db, task, order)

        self.assertEqual(int(item.id), 7)
        self.assertEqual(int(item.order_id), 100)
        self.assertEqual(item.order_number, "Z-100")


if __name__ == "__main__":
    unittest.main()
