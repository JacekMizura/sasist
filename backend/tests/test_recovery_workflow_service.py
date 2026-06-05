"""
RecoveryWorkflowService — jedno źródło prawdy dla dogrywki / kolejki / finalize.

  python -m pytest backend/tests/test_recovery_workflow_service.py -q
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.recovery_workflow_service import (
    count_recovery_operational_lines,
    get_recovery_pick_lines,
    resolve_order_recovery_state,
)


def _oi(**kwargs):
    defaults = {
        "id": 1,
        "product_id": 197,
        "quantity": 1.0,
        "oms_line_status": None,
        "wms_picking_line_missing_qty": 0.0,
        "wms_shortage_declared_qty": 0.0,
        "wms_picking_line_status": None,
        "replaced_from_order_item_id": None,
        "is_bundle_parent": False,
        "parent_bundle_order_item_id": None,
        "oms_removed_qty": 0.0,
        "oms_replaced_qty": 0.0,
        "metadata_json": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(items, **kwargs):
    defaults = {"id": 1196, "number": "1196", "tenant_id": 1, "warehouse_id": 1, "items": items, "cart_id": 1}
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestRecoveryWorkflowService:
    def test_partial_pick_one_recovery_line(self):
        picked_line = _oi(id=10, product_id=100, quantity=1.0)
        pending_line = _oi(id=55, product_id=301, quantity=1.0)
        order = _order([picked_line, pending_line])
        db = MagicMock()

        def _picked(db_, oid, order_):
            return 1.0 if int(oid) == 10 else 0.0

        with patch(
            "backend.services.recovery_workflow_service.line_picked_sum_for_order",
            side_effect=_picked,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ), patch(
            "backend.services.braki_order_state_service.order_line_requires_oms_decision",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.order_line_pick_still_possible",
            side_effect=lambda db, order, oi: int(oi.id) == 55,
        ), patch(
            "backend.services.order_fulfillment_recompute.order_item_needs_substitute_pick_completion",
            return_value=False,
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_alloc_counts_for_order",
            return_value=(0, 0, 0),
        ):
            state = resolve_order_recovery_state(db, order, log=False)
            rows = get_recovery_pick_lines(db, order, log=False)
            u, r = count_recovery_operational_lines(db, order)

        assert state.recovery_status == "recovery_pending"
        assert state.has_recovery_pick_work is True
        assert state.has_recovery_work is True
        assert state.packing_allowed is False
        assert state.totals.recovery_lines == 1
        assert len(rows) == 1
        assert int(rows[0]["order_item_id"]) == 55
        assert float(rows[0]["unresolved_qty"]) >= 1.0
        assert u == 0
        assert r == 1

        recovery_line = next(ln for ln in state.lines if ln.order_line_id == 55)
        assert recovery_line.visible_in_recovery_pick is True
        assert recovery_line.visible_in_queue is True
        assert recovery_line.active_recovery is True
        assert recovery_line.packing_eligible is False

    def test_packing_allowed_false_when_recovery_visible(self):
        """packing_allowed nie może być true gdy visible_in_recovery_pick."""
        pending_line = _oi(id=55, product_id=301, quantity=1.0)
        order = _order([pending_line])
        db = MagicMock()
        with patch(
            "backend.services.recovery_workflow_service.line_picked_sum_for_order",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ), patch(
            "backend.services.braki_order_state_service.order_line_requires_oms_decision",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.order_line_pick_still_possible",
            return_value=True,
        ), patch(
            "backend.services.order_fulfillment_recompute.order_item_needs_substitute_pick_completion",
            return_value=False,
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_alloc_counts_for_order",
            return_value=(0, 0, 0),
        ):
            state = resolve_order_recovery_state(db, order, log=False)
        assert len(state.lines) == 1
        assert state.lines[0].visible_in_recovery_pick is True
        assert state.packing_allowed is False
        assert state.has_recovery_pick_work is True

    def test_queue_recovery_count_matches_pick_lines(self):
        """Licznik dogrywki w kolejce = liczba linii visible_in_recovery_pick."""
        pending_line = _oi(id=55, product_id=301, quantity=1.0)
        second_line = _oi(id=56, product_id=302, quantity=2.0)
        order = _order([pending_line, second_line])
        db = MagicMock()

        def _missing(db, order, oi, session_cart_id=None):
            if int(oi.id) == 55:
                return 0.0
            if int(oi.id) == 56:
                return 0.0
            return 0.0

        def _picked(db, oid, order):
            return 0.0 if int(oid) == 55 else 1.0

        with patch(
            "backend.services.recovery_workflow_service.line_picked_sum_for_order",
            side_effect=_picked,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            side_effect=_missing,
        ), patch(
            "backend.services.braki_order_state_service.order_line_requires_oms_decision",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.order_line_pick_still_possible",
            return_value=True,
        ), patch(
            "backend.services.order_fulfillment_recompute.order_item_needs_substitute_pick_completion",
            return_value=False,
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_alloc_counts_for_order",
            return_value=(0, 0, 0),
        ):
            state = resolve_order_recovery_state(db, order, log=False)
            rows = get_recovery_pick_lines(db, order, log=False)
            u, r = count_recovery_operational_lines(db, order)
        pick_visible = sum(1 for ln in state.lines if ln.visible_in_recovery_pick)
        assert r == pick_visible
        assert len(rows) == pick_visible
        assert r == len(rows)

    def test_removed_with_pick_requires_relocation(self):
        oi = _oi(id=20, product_id=400, quantity=2.0, oms_removed_qty=2.0)
        order = _order([oi])
        db = MagicMock()

        with patch(
            "backend.services.recovery_workflow_service.line_picked_sum_for_order",
            return_value=1.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ), patch(
            "backend.services.braki_order_state_service.order_line_requires_oms_decision",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.order_line_pick_still_possible",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.order_item_needs_substitute_pick_completion",
            return_value=False,
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_alloc_counts_for_order",
            return_value=(0, 0, 0),
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_line_alloc_states_for_order",
            return_value={},
        ):
            state = resolve_order_recovery_state(db, order, log=False)

        line = state.lines[0]
        assert line.relocation_required is True
        assert line.visible_in_relocation is True
        assert line.active_recovery is False

    def test_relocation_done_does_not_block_packing(self):
        """Po zakończonym rozlokowaniu has_pending_relocation=false mimo relocation_required."""
        oi = _oi(id=20, product_id=400, quantity=2.0, oms_removed_qty=2.0)
        order = _order([oi])
        db = MagicMock()

        with patch(
            "backend.services.recovery_workflow_service.line_picked_sum_for_order",
            return_value=1.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ), patch(
            "backend.services.braki_order_state_service.order_line_requires_oms_decision",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.order_line_pick_still_possible",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.order_item_needs_substitute_pick_completion",
            return_value=False,
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_alloc_counts_for_order",
            return_value=(0, 0, 1),
        ), patch(
            "backend.services.wms_relocation_workflow.relocation_line_alloc_states_for_order",
            return_value={20: "done"},
        ):
            state = resolve_order_recovery_state(db, order, log=False)

        line = state.lines[0]
        assert line.relocation_required is True
        assert line.visible_in_relocation is False
        assert state.has_pending_relocation is False
