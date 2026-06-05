"""
Finalize / packing / relocation — jedno źródło prawdy RecoveryWorkflowService.

  python -m pytest backend/tests/test_recovery_workflow_finalize.py -q
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.services.recovery_workflow_service import (
    OrderRecoveryState,
    RecoveryLineState,
    RecoveryTotals,
    RecoveryWorkflowError,
    STATE_VERSION,
    validate_order_finalize_allowed,
)


def _line(**kwargs):
    defaults = {
        "order_line_id": 55,
        "product_id": 301,
        "ordered_qty": 1.0,
        "picked_qty": 0.0,
        "removed_qty": 0.0,
        "replacement_qty": 0.0,
        "unresolved_qty": 1.0,
        "recovery_qty": 1.0,
        "shortage_reported": False,
        "replacement_applied": False,
        "relocation_required": False,
        "active_recovery": True,
        "recovery_completed": False,
        "visible_in_queue": True,
        "visible_in_recovery_pick": True,
        "visible_in_relocation": False,
        "visible_in_finalize": True,
        "packing_eligible": False,
        "finalize_allowed": True,
        "reason": "recovery_pick_pending",
    }
    defaults.update(kwargs)
    return RecoveryLineState(**defaults)


def _state(**kwargs):
    defaults = {
        "order_id": 1196,
        "recovery_status": "recovery_pending",
        "lines": [_line()],
        "totals": RecoveryTotals(recovery_lines=1, unresolved_lines=1),
        "has_recovery_work": True,
        "has_relocation_work": False,
        "packing_allowed": False,
        "finalize_allowed": True,
        "state_version": STATE_VERSION,
        "state_hash": "abc",
        "resolved_at": "2026-06-04T12:00:00Z",
    }
    defaults.update(kwargs)
    return OrderRecoveryState(**defaults)


class TestValidateOrderFinalizeAllowed:
    def test_recovery_deferred_allowed(self):
        validate_order_finalize_allowed(_state(), order_number="1196")

    def test_oms_blocks_finalize(self):
        st = _state(
            finalize_allowed=False,
            lines=[_line(finalize_allowed=False, active_recovery=False, reason="awaiting_oms")],
        )
        with pytest.raises(RecoveryWorkflowError) as exc:
            validate_order_finalize_allowed(st, order_number="1196")
        assert exc.value.http_status == 400
        assert exc.value.code == "oms_decision_required"


class TestRelocationResolverGate:
    @patch("backend.services.recovery_workflow_service.resolve_order_recovery_state")
    def test_ordinary_shortage_skips_relocation(self, mock_state):
        from backend.services.braki_order_state_service import ensure_relocation_for_order_item_picks

        mock_state.return_value = _state(
            has_relocation_work=False,
            lines=[_line(relocation_required=False, picked_qty=0.0, active_recovery=True)],
        )
        order = SimpleNamespace(id=500, tenant_id=1, warehouse_id=1, cart_id=9)
        db = MagicMock()
        oi = SimpleNamespace(id=55, order_id=500, product_id=301, quantity=1.0)
        oi_q = MagicMock()
        oi_q.filter.return_value.first.return_value = oi
        db.query.return_value = oi_q

        task_ids = ensure_relocation_for_order_item_picks(
            db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            order_item_id=55,
            source_event_id="test:shortage",
        )
        assert task_ids == []
