"""
Recovery pick domknięty → ``ready_pack``, nie ``pick``.

  python -m pytest backend/tests/test_braki_picking_resolved_ready_pack.py -q
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.braki_workflow_service import (
    BRAKI_FILTER_PICK,
    BRAKI_FILTER_READY_PACK,
    resolve_braki_workflow_status,
)
from backend.services.braki_order_state_service import (
    order_braki_picking_resolved,
    order_can_show_ready_pack,
)


def _order(**kwargs):
    defaults = {
        "id": 1171,
        "tenant_id": 1,
        "warehouse_id": 1,
        "fulfillment_state": "NEEDS_DECISION",
        "items": [
            SimpleNamespace(
                id=10,
                product_id=100,
                quantity=1,
                wms_shortage_declared_qty=1.0,
                wms_picking_line_missing_qty=0.0,
                metadata_json=None,
                oms_line_status=None,
            )
        ],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestBrakiPickingResolvedReadyPack(unittest.TestCase):
    def test_picking_resolved_after_recovery(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_has_active_braki_operations",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
            return_value=None,
        ), patch(
            "backend.services.braki_order_state_service.order_has_pending_relocation_work",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute._order_fully_picked_for_fulfillment",
            return_value=True,
        ):
            self.assertTrue(order_braki_picking_resolved(db, order))
            self.assertTrue(order_can_show_ready_pack(db, order))

    def test_resolve_ready_pack_when_picking_resolved(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=True,
        ), patch(
            "backend.services.braki_order_state_service.evaluate_order_braki_state",
            return_value={"resolved": True, "final_status": "ready_pack"},
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.braki_workflow_service.order_needs_warehouse_pick",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_customer_line",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_for_stock_lines",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_READY_PACK)
        self.assertNotEqual(status, BRAKI_FILTER_PICK)


if __name__ == "__main__":
    unittest.main()
