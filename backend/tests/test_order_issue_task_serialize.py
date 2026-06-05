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
                "backend.api.wms_order_issue_tasks._build_task_operational_bundle",
                return_value={
                    "braki_workflow_status": "awaiting",
                    "braki_workflow_status_label": "Oczekujące",
                    "issue_queue_summary_line": "Oczekujące",
                    "issue_queue_status_label": "Oczekujące",
                    "unresolved_shortage_count": 1,
                    "replacement_pick_pending_count": 0,
                    "order_context": {
                        "collected_lines": [],
                        "shortage_decision_lines": [],
                        "remaining_pick_lines": [],
                    },
                    "shortage_lines": [],
                    "partial_data": False,
                    "queue_warnings": [],
                    "braki_operational_state": {
                        "workflow_stage": "Oczekujące",
                        "queue_stage": "awaiting",
                        "can_remove_from_braki": True,
                        "can_close_shortage": True,
                    },
                },
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
