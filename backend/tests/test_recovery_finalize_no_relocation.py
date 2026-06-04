"""Recovery finalize nie tworzy zadań rozlokowania po udanym picku."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch


class TestRecoveryFinalizeNoRelocation(unittest.TestCase):
    @patch("backend.services.wms_operational_task_service.merge_relocation_from_picks")
    def test_finalize_does_not_create_relocation(self, mock_merge):
        from backend.services.wms_picking_product_list_service import finalize_wms_recovery_picking_cart

        rt = SimpleNamespace(id=1, status="open")
        cart = SimpleNamespace(id=9, code="C1", tenant_id=1, warehouse_id=1)
        order = SimpleNamespace(
            id=1206,
            tenant_id=1,
            warehouse_id=1,
            cart_id=9,
            number="1206",
            items=[],
            order_ui_status_id=5,
        )
        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            name = getattr(model, "__name__", str(model))
            if name == "WmsRecoveryPickTask":
                q.first.return_value = rt
            elif name == "Cart":
                q.first.return_value = cart
            elif name == "Order":
                q.options.return_value.filter.return_value.all.return_value = [order]
            elif name == "Pick":
                q.filter.return_value.order_by.return_value.with_for_update.return_value.all.return_value = []
            elif name == "WmsPackingSettings":
                q.filter.return_value.first.return_value = None
            return q

        db.query.side_effect = query_side

        with (
            patch(
                "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
            ),
            patch(
                "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
                return_value={1: 1.0},
            ),
            patch(
                "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
                return_value={},
            ),
            patch(
                "backend.services.wms_picking_product_list_service._picked_by_product",
                return_value={1: 1.0},
            ),
            patch(
                "backend.services.wms_picking_product_list_service._classify_order_after_picking_session",
                return_value="all_picked",
            ),
            patch(
                "backend.services.wms_recovery_pick_service.mark_recovery_task_done",
            ),
            patch(
                "backend.services.order_fulfillment_recompute.recalculate_order_shortage_state",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.emit_wms_picking_finished",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.record_picking_cart_finalize_session",
            ),
            patch(
                "backend.services.wms_picking_shortage_settings_service.get_or_create_wms_picking_shortage_settings",
                return_value=SimpleNamespace(recovery_completed_order_ui_status_id=None),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.apply_fulfillment_state",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.mark_pick_events_finalized_for_pick_ids",
            ),
        ):
            finalize_wms_recovery_picking_cart(
                db,
                tenant_id=1,
                warehouse_id=1,
                order_id=1206,
                cart_id=9,
            )

        mock_merge.assert_not_called()


if __name__ == "__main__":
    unittest.main()
