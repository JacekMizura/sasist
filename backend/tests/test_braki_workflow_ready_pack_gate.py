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


def _rec_state(*, packing_allowed: bool):
    return SimpleNamespace(
        packing_allowed=packing_allowed,
        totals=SimpleNamespace(recovery_lines=0, oms_decision_lines=0, unresolved_lines=0),
    )


class TestBrakiReadyPackGate(unittest.TestCase):
    def test_resolve_not_ready_pack_when_gate_closed(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.recovery_workflow_service.resolve_order_recovery_state",
            return_value=_rec_state(packing_allowed=False),
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.braki_workflow_service.order_needs_warehouse_pick",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service._order_relocation_alloc_states",
            return_value=(0, 0, 0),
        ), patch(
            "backend.services.braki_order_state_service.order_has_pending_shortage_decision",
            return_value=True,
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_AWAITING)

    def test_resolve_ready_pack_when_gate_open(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.recovery_workflow_service.resolve_order_recovery_state",
            return_value=_rec_state(packing_allowed=True),
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.braki_workflow_service.order_needs_warehouse_pick",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service._order_relocation_alloc_states",
            return_value=(0, 0, 0),
        ), patch(
            "backend.services.braki_order_state_service.order_has_pending_shortage_decision",
            return_value=False,
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_READY_PACK)


if __name__ == "__main__":
    unittest.main()
