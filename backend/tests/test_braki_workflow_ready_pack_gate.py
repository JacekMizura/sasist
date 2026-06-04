"""
Gate ``ready_pack`` — zamówienia z brakami nie mogą być gotowe do pakowania.

  python -m pytest backend/tests/test_braki_workflow_ready_pack_gate.py -q
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.braki_workflow_service import (
    BRAKI_FILTER_AWAITING,
    BRAKI_FILTER_READY_PACK,
    resolve_braki_workflow_status,
)


def _order(**kwargs):
    defaults = {"id": 1206, "tenant_id": 1, "warehouse_id": 1, "items": []}
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestBrakiReadyPackGate(unittest.TestCase):
    def test_resolve_not_ready_pack_when_gate_closed(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.evaluate_order_braki_state",
            return_value={"resolved": False, "final_status": "awaiting"},
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
        self.assertEqual(status, BRAKI_FILTER_AWAITING)

    def test_resolve_ready_pack_when_gate_open(self):
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


if __name__ == "__main__":
    unittest.main()
