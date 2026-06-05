"""
Finalize wózka z częściową zbiórką — linie dogrywki nie blokują domknięcia sesji.

  python -m pytest backend/tests/test_wms_picking_finalize_recovery_deferred.py -q
"""

from types import SimpleNamespace
from unittest.mock import MagicMock, patch

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


class TestRecoveryDeferredFinalize:
    def test_unpicked_line_without_shortage_is_recovery_deferred(self):
        """Częściowa zbiórka: niezebrana linia bez braku → dogrywka, nie błąd finalize."""
        oi = _oi(id=55, product_id=301, quantity=1.0)
        order = _order([oi])
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_pick_events_for_line_cart",
            return_value=0.0,
        ), patch(
            "backend.services.order_fulfillment_recompute.sum_missing_events_for_line_cart",
            return_value=0.0,
        ), patch(
            "backend.services.wms_recovery_pick_service.line_picked_sum_for_order",
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
            ok, reason = _picking_line_resolved_for_finalize(
                db, order, oi, tenant_id=1, warehouse_id=1, cart_id=9
            )
        assert ok is True
        assert reason == "recovery_deferred"

    def test_get_unresolved_recovery_lines_partial_order(self):
        picked_line = _oi(id=10, product_id=100, quantity=1.0)
        pending_line = _oi(id=55, product_id=301, quantity=1.0)
        order = _order([picked_line, pending_line])
        db = MagicMock()

        def _picked(db_, oid, order_):
            return 1.0 if int(oid) == 10 else 0.0

        with patch(
            "backend.services.fulfillment_event_service.line_picked_sum_for_order",
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
            rows = get_unresolved_recovery_lines(db, order, log=False)

        assert len(rows) == 1
        assert int(rows[0]["order_item_id"]) == 55
        assert int(rows[0]["product_id"]) == 301
        assert float(rows[0]["unresolved_qty"]) >= 1.0
        assert rows[0]["recovery_eligible"] is True
