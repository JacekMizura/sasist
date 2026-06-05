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


def _rec_state(*, packing_allowed: bool, oms_decision_lines: int = 0):
    return SimpleNamespace(
        packing_allowed=packing_allowed,
        has_recovery_pick_work=False,
        has_pending_relocation=False,
        relocation_alloc_pending=0,
        relocation_alloc_partial=0,
        totals=SimpleNamespace(
            recovery_lines=0,
            oms_decision_lines=oms_decision_lines,
            unresolved_lines=0,
        ),
    )


class TestBrakiReadyPackGate(unittest.TestCase):
    def test_resolve_not_ready_pack_when_gate_closed(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.recovery_workflow_service.resolve_order_recovery_state",
            return_value=_rec_state(packing_allowed=False, oms_decision_lines=1),
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
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
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_READY_PACK)


if __name__ == "__main__":
    unittest.main()
