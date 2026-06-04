"""
``NEEDS_DECISION`` w ``fulfillment_state`` nie powinno wymuszać fazy UI „Braki — decyzja”,
gdy brak aktywnej decyzji OMS (``compute_line_missing_qty`` = 0).

  python -m pytest backend/tests/test_wms_workflow_phase_pending_decision.py -q
"""

import unittest
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_workflow_phase import compute_wms_workflow_phase


def _order(**kwargs):
    defaults = {
        "id": 9001,
        "tenant_id": 1,
        "warehouse_id": 1,
        "fulfillment_state": "NEEDS_DECISION",
        "cart_id": 5,
        "picking_finished_at": datetime.now(timezone.utc),
        "packing_started_at": None,
        "packed_at": None,
        "items": [
            SimpleNamespace(
                id=1,
                quantity=1,
                wms_shortage_declared_qty=1.0,
                wms_picking_line_missing_qty=0.0,
                metadata_json=None,
            )
        ],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestWmsWorkflowPhasePendingDecision(unittest.TestCase):
    def test_stale_needs_decision_maps_to_ready_to_pack(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_has_pending_shortage_decision",
            return_value=False,
        ):
            phase = compute_wms_workflow_phase(order, db=db)
        self.assertEqual(phase, "READY_TO_PACK")

    def test_active_missing_keeps_needs_decision(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_has_pending_shortage_decision",
            return_value=True,
        ):
            phase = compute_wms_workflow_phase(order, db=db)
        self.assertEqual(phase, "NEEDS_DECISION")

    def test_without_db_legacy_fulfillment_state(self):
        order = _order()
        self.assertEqual(compute_wms_workflow_phase(order), "NEEDS_DECISION")


if __name__ == "__main__":
    unittest.main()
