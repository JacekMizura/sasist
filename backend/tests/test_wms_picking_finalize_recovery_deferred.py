"""
Finalize wózka z częściową zbiórką — linie dogrywki nie blokują domknięcia sesji.

  python -m pytest backend/tests/test_wms_picking_finalize_recovery_deferred.py -q
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.recovery_workflow_service import RecoveryLineState, OrderRecoveryState, RecoveryTotals
from backend.services.wms_picking_product_list_service import _picking_line_resolved_for_finalize
from backend.services.wms_recovery_pick_service import get_unresolved_recovery_lines


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


def _recovery_pending_line(*, order_line_id: int, product_id: int) -> RecoveryLineState:
    return RecoveryLineState(
        order_line_id=order_line_id,
        product_id=product_id,
        ordered_qty=1.0,
        picked_qty=0.0,
        removed_qty=0.0,
        replacement_qty=0.0,
        unresolved_qty=1.0,
        recovery_qty=1.0,
        shortage_reported=False,
        replacement_applied=False,
        relocation_required=False,
        active_recovery=True,
        recovery_completed=False,
        visible_in_queue=True,
        visible_in_recovery_pick=True,
        visible_in_relocation=False,
        visible_in_finalize=False,
        packing_eligible=False,
        finalize_allowed=False,
        reason="recovery_pick_pending",
    )


class TestRecoveryDeferredFinalize:
    def test_unpicked_line_without_shortage_is_recovery_deferred(self):
        """Częściowa zbiórka: niezebrana linia bez braku → dogrywka, nie błąd finalize."""
        oi = _oi(id=55, product_id=301, quantity=1.0)
        order = _order([oi])
        db = MagicMock()
        state = OrderRecoveryState(
            order_id=int(order.id),
            recovery_status="RECOVERY_PICK",
            lines=[_recovery_pending_line(order_line_id=55, product_id=301)],
            totals=RecoveryTotals(),
            has_recovery_pick_work=True,
            has_unresolved_lines=True,
            has_recovery_work=True,
        )
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.line_closed_for_picking_finalize",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.line_shortage_qty_for_picking_finalize",
            return_value=0.0,
        ):
            ok, reason = _picking_line_resolved_for_finalize(
                db,
                order,
                oi,
                tenant_id=1,
                warehouse_id=1,
                cart_id=9,
                recovery_state=state,
            )
        assert ok is True
        assert reason == "recovery_deferred"

    def test_get_unresolved_recovery_lines_partial_order(self):
        picked_line = _oi(id=10, product_id=100, quantity=1.0)
        pending_line = _oi(id=55, product_id=301, quantity=1.0)
        order = _order([picked_line, pending_line])
        db = MagicMock()

        def _picked(_db, oid, _order):
            return 1.0 if int(oid) == 10 else 0.0

        with patch(
            "backend.services.recovery_workflow_service.line_picked_sum_for_order",
            side_effect=_picked,
        ), patch(
            "backend.services.recovery_workflow_service.sum_pick_events_for_line_cart",
            side_effect=lambda _db, oid, _cid: _picked(_db, oid, order),
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.line_shortage_qty_for_picking_finalize",
            return_value=0.0,
        ), patch(
            "backend.services.braki_order_state_service.order_line_requires_oms_decision",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.order_line_pick_still_possible",
            side_effect=lambda _db, _order, oi: int(oi.id) == 55,
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
            rows = get_unresolved_recovery_lines(db, order, log=False)

        assert len(rows) == 1
        assert int(rows[0]["order_item_id"]) == 55
        assert int(rows[0]["product_id"]) == 301
        assert float(rows[0]["unresolved_qty"]) >= 1.0
        assert rows[0]["recovery_eligible"] is True
