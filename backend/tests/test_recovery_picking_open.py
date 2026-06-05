"""
Dogrywka z kolejki Braki — otwarcie bez wcześniejszego zadania recovery_pick.

  python -m pytest backend/tests/test_recovery_picking_open.py -q
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_recovery_pick_service import (
    order_has_recovery_pick_work,
    prepare_recovery_picking_for_order,
)


def _order_pick_pending(**kwargs):
    defaults = {
        "id": 1197,
        "tenant_id": 1,
        "warehouse_id": 1,
        "items": [
            SimpleNamespace(
                id=1,
                product_id=10,
                quantity=1.0,
                parent_bundle_order_item_id=None,
                metadata_json=None,
                oms_line_status=None,
            ),
            SimpleNamespace(
                id=2,
                product_id=11,
                quantity=1.0,
                parent_bundle_order_item_id=None,
                metadata_json=None,
                oms_line_status=None,
            ),
        ],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestRecoveryPickingOpen(unittest.TestCase):
    def test_has_recovery_work_when_pick_lines_pending(self):
        order = _order_pick_pending()
        db = MagicMock()
        with (
            patch(
                "backend.services.wms_recovery_pick_service.count_issue_queue_operational_lines",
                return_value=(0, 2),
            ),
            patch(
                "backend.services.wms_recovery_pick_service.order_has_pending_replacement_picking",
                return_value=False,
            ),
        ):
            self.assertTrue(order_has_recovery_pick_work(db, order))

    def test_prepare_creates_task_and_not_completed(self):
        order = _order_pick_pending()
        db = MagicMock()
        task = SimpleNamespace(id=99, status="open")
        with (
            patch(
                "backend.services.wms_recovery_pick_service.recompute_order_fulfillment",
            ),
            patch.object(db, "query") as qmock,
            patch(
                "backend.services.wms_recovery_pick_service.order_has_recovery_pick_work",
                return_value=True,
            ),
            patch(
                "backend.services.wms_recovery_pick_service._recovery_line_stats",
                return_value={"unresolved_lines_count": 2, "resolved_lines_count": 0, "removed_lines_count": 0},
            ),
            patch(
                "backend.services.wms_recovery_pick_service.count_issue_queue_operational_lines",
                return_value=(0, 2),
            ),
            patch(
                "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
                return_value=None,
            ),
            patch(
                "backend.services.wms_recovery_pick_service.ensure_recovery_pick_task",
                return_value=task,
            ) as ensure_mock,
        ):
            chain = MagicMock()
            chain.options.return_value.filter.return_value.first.return_value = order
            qmock.return_value = chain
            snap = prepare_recovery_picking_for_order(
                db, tenant_id=1, warehouse_id=1, order_id=1197, cart_id=5
            )
        self.assertTrue(snap["ok"])
        self.assertFalse(snap["completed"])
        self.assertEqual(snap["recovery_task_id"], 99)
        ensure_mock.assert_called_once()

    def test_prepare_completed_when_no_work(self):
        order = _order_pick_pending()
        db = MagicMock()
        with (
            patch(
                "backend.services.wms_recovery_pick_service.recompute_order_fulfillment",
            ),
            patch.object(db, "query") as qmock,
            patch(
                "backend.services.wms_recovery_pick_service.order_has_recovery_pick_work",
                return_value=False,
            ),
            patch(
                "backend.services.wms_recovery_pick_service._recovery_line_stats",
                return_value={"unresolved_lines_count": 0, "resolved_lines_count": 2, "removed_lines_count": 0},
            ),
            patch(
                "backend.services.wms_recovery_pick_service.count_issue_queue_operational_lines",
                return_value=(0, 0),
            ),
            patch(
                "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
                return_value=None,
            ),
        ):
            chain = MagicMock()
            chain.options.return_value.filter.return_value.first.return_value = order
            qmock.return_value = chain
            snap = prepare_recovery_picking_for_order(
                db, tenant_id=1, warehouse_id=1, order_id=1197
            )
        self.assertTrue(snap["ok"])
        self.assertTrue(snap["completed"])


if __name__ == "__main__":
    unittest.main()
