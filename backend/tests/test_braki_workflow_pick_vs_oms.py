"""
Braki: częściowe zbieranie nie powinno wymuszać „decyzja OMS”.

  python -m pytest backend/tests/test_braki_workflow_pick_vs_oms.py -q
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.braki_order_state_service import (
    count_issue_queue_operational_lines,
    order_has_pending_shortage_decision,
    order_line_pick_still_possible,
    order_line_requires_oms_decision,
)
from backend.services.braki_workflow_service import (
    BRAKI_FILTER_AWAITING,
    BRAKI_FILTER_PICK,
    resolve_braki_workflow_status,
)
from backend.services.order_issue_task_service import format_braki_issue_summary_line


def _order_1196_like():
    """1 zebrane, 2 niezebrane — bez eskalacji OMS."""
    return SimpleNamespace(
        id=1196,
        tenant_id=1,
        warehouse_id=1,
        cart_id=5,
        items=[
            SimpleNamespace(
                id=1,
                product_id=10,
                quantity=1.0,
                parent_bundle_order_item_id=None,
                metadata_json=None,
                oms_line_status=None,
                wms_shortage_declared_qty=0.0,
                wms_picking_line_missing_qty=0.0,
                replaced_from_order_item_id=None,
            ),
            SimpleNamespace(
                id=2,
                product_id=11,
                quantity=1.0,
                parent_bundle_order_item_id=None,
                metadata_json=None,
                oms_line_status=None,
                wms_shortage_declared_qty=0.0,
                wms_picking_line_missing_qty=0.0,
                replaced_from_order_item_id=None,
            ),
            SimpleNamespace(
                id=3,
                product_id=12,
                quantity=1.0,
                parent_bundle_order_item_id=None,
                metadata_json=None,
                oms_line_status=None,
                wms_shortage_declared_qty=0.0,
                wms_picking_line_missing_qty=0.0,
                replaced_from_order_item_id=None,
            ),
        ],
    )


class TestBrakiWorkflowPickVsOms(unittest.TestCase):
    def test_unpicked_lines_are_pick_not_oms_decision(self):
        order = _order_1196_like()
        db = MagicMock()
        with (
            patch(
                "backend.services.fulfillment_event_service.line_picked_sum_for_order",
                side_effect=lambda _db, oiid, _o: 1.0 if oiid == 1 else 0.0,
            ),
            patch(
                "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
                return_value=0.0,
            ),
            patch(
                "backend.services.order_fulfillment_recompute.order_item_needs_substitute_pick_completion",
                return_value=False,
            ),
            patch(
                "backend.services.wms_operational_task_service._line_remaining_qty",
                side_effect=lambda _db, _o, oi: 0.0 if int(oi.id) == 1 else 1.0,
            ),
        ):
            self.assertTrue(order_line_pick_still_possible(db, order, order.items[1]))
            self.assertTrue(order_line_pick_still_possible(db, order, order.items[2]))
            self.assertFalse(order_line_requires_oms_decision(db, order, order.items[1]))
            self.assertFalse(order_has_pending_shortage_decision(db, order))
            u_short, r_pend = count_issue_queue_operational_lines(db, order)
            self.assertEqual(u_short, 0)
            self.assertEqual(r_pend, 2)

    def test_workflow_status_is_pick_not_awaiting(self):
        order = _order_1196_like()
        db = MagicMock()
        with (
            patch(
                "backend.services.braki_order_state_service.count_issue_queue_operational_lines",
                return_value=(0, 2),
            ),
            patch(
                "backend.services.braki_workflow_service.order_needs_warehouse_pick",
                return_value=True,
            ),
            patch(
                "backend.services.braki_workflow_service._order_relocation_alloc_states",
                return_value=(0, 0, 0),
            ),
            patch(
                "backend.services.braki_order_state_service.order_can_show_ready_pack",
                return_value=False,
            ),
            patch(
                "backend.services.braki_order_state_service.order_has_pending_shortage_decision",
                return_value=False,
            ),
            patch(
                "backend.services.braki_order_state_service.evaluate_order_braki_state",
                return_value={"resolved": False},
            ),
            patch(
                "backend.services.braki_order_state_service.order_line_pick_still_possible",
                return_value=True,
            ),
        ):
            status = resolve_braki_workflow_status(db, order, u_short=0, r_pend=2)
        self.assertEqual(status, BRAKI_FILTER_PICK)

    def test_summary_line_for_pick_not_oms(self):
        line = format_braki_issue_summary_line(
            BRAKI_FILTER_PICK,
            unresolved=0,
            repl_pending=2,
            oms_waiting=False,
        )
        self.assertEqual(line, "Oczekujące produkty do zebrania")

    def test_summary_line_for_awaiting_is_oms(self):
        line = format_braki_issue_summary_line(
            BRAKI_FILTER_AWAITING,
            unresolved=1,
            repl_pending=0,
            oms_waiting=True,
        )
        self.assertEqual(line, "Oczekuje na decyzję OMS")


if __name__ == "__main__":
    unittest.main()
