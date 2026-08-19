"""Direct sale panel status goes through apply_order_panel_ui_status; WMS hooks skip DIRECT_SALE.

  python -m pytest backend/tests/direct_sales/test_direct_sale_panel_status_ssot.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.order_default_new_panel_status import assign_direct_sale_completed_panel_status
from backend.services.order_panel_ui_status_service import apply_order_panel_ui_status


def _order(*, channel: str, fulfillment: str = "WMS") -> SimpleNamespace:
    return SimpleNamespace(
        id=41,
        tenant_id=1,
        warehouse_id=1,
        cart_id=None,
        order_channel=channel,
        fulfillment_mode=fulfillment,
        order_ui_status_id=None,
        shipping_method_id=None,
    )


class TestDirectSalePanelStatusSsot(unittest.TestCase):
    def test_assign_calls_apply_order_panel_ui_status(self):
        db = MagicMock()
        order = _order(channel="DIRECT_SALE", fulfillment="IMMEDIATE")
        with patch(
            "backend.services.order_status_select_service.resolve_order_status_id_with_fallback",
            return_value=15,
        ), patch(
            "backend.services.order_panel_ui_status_service.apply_order_panel_ui_status",
        ) as apply:
            assign_direct_sale_completed_panel_status(
                db, order, configured_status_id=15, operator_user_id=4
            )
        apply.assert_called_once()
        kwargs = apply.call_args.kwargs
        self.assertEqual(kwargs["sub_status_id"], 15)
        self.assertEqual(kwargs["operator_user_id"], 4)
        self.assertIs(kwargs["order"], order)

    def test_direct_sale_writes_status_without_wms_hooks(self):
        db = MagicMock()
        order = _order(channel="DIRECT_SALE", fulfillment="IMMEDIATE")
        with patch(
            "backend.services.order_panel_ui_status_service._run_smart_matching_status_hook",
        ) as smart, patch(
            "backend.services.order_panel_ui_status_service._run_production_status_hook",
        ) as prod, patch(
            "backend.services.order_panel_ui_status_service._run_picking_entry_readiness_dry_run_hook",
        ) as pick:
            apply_order_panel_ui_status(db, order=order, sub_status_id=22)
        self.assertEqual(order.order_ui_status_id, 22)
        smart.assert_not_called()
        prod.assert_not_called()
        pick.assert_not_called()

    def test_wms_order_still_runs_status_hooks(self):
        db = MagicMock()
        order = _order(channel="ONLINE", fulfillment="WMS")
        with patch(
            "backend.services.order_panel_ui_status_service._run_smart_matching_status_hook",
        ) as smart, patch(
            "backend.services.order_panel_ui_status_service._run_production_status_hook",
        ) as prod, patch(
            "backend.services.order_panel_ui_status_service._run_picking_entry_readiness_dry_run_hook",
        ) as pick:
            apply_order_panel_ui_status(db, order=order, sub_status_id=22)
        self.assertEqual(order.order_ui_status_id, 22)
        smart.assert_called_once()
        prod.assert_called_once()
        pick.assert_called_once()


if __name__ == "__main__":
    unittest.main()
