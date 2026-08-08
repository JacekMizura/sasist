"""
Pakowanie: oznacz linię jako brak + status z missing_status_id.

  python -m pytest backend/tests/test_packing_mark_shortage.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_packing_shortage_service import (
    PackingShortageError,
    packing_mark_line_shortage_and_defer,
)


class TestPackingMarkShortage(unittest.TestCase):
    def test_requires_missing_status_configured(self):
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(missing_status_id=None)
        with self.assertRaises(PackingShortageError) as ctx:
            packing_mark_line_shortage_and_defer(
                db,
                tenant_id=1,
                warehouse_id=1,
                order_id=10,
                order_item_id=20,
            )
        self.assertEqual(ctx.exception.code, "MISSING_STATUS_NOT_CONFIGURED")

    def test_marks_line_and_sets_status(self):
        settings = SimpleNamespace(missing_status_id=77)
        status_row = SimpleNamespace(id=77, name="BRAKI")
        oi = SimpleNamespace(
            id=20,
            order_id=10,
            product_id=5,
            packing_quantity_packed=0,
            wms_shortage_declared_qty=0.0,
            wms_picking_line_missing_qty=0.0,
            wms_picking_line_status=None,
        )
        order = SimpleNamespace(id=10, number="Z-1", order_ui_status_id=8, items=[oi])

        def _query_side_effect(model):
            q = MagicMock()
            name = getattr(model, "__name__", str(model))
            if "WmsPackingSettings" in name or "wms_packing_settings" in str(model).lower():
                q.filter.return_value.first.return_value = settings
            elif "OrderUiStatus" in name:
                q.filter.return_value.first.return_value = status_row
            elif "OrderItem" in name:
                q.filter.return_value.first.return_value = oi
            else:
                # Order with options().filter()
                q.options.return_value.filter.return_value.first.return_value = order
                q.filter.return_value.first.return_value = order
            return q

        db = MagicMock()
        db.query.side_effect = _query_side_effect

        with (
            patch(
                "backend.services.wms_packing_shortage_service.order_item_required_pack_qty",
                return_value=3,
            ),
            patch("backend.services.wms_packing_shortage_service.append_event") as append_ev,
            patch("backend.services.wms_packing_shortage_service.sync_declared_shortage_column_from_missing_events"),
            patch("backend.services.wms_packing_shortage_service.recompute_order_fulfillment") as recompute,
        ):
            out = packing_mark_line_shortage_and_defer(
                db,
                tenant_id=1,
                warehouse_id=1,
                order_id=10,
                order_item_id=20,
                operator_user_id=3,
            )

        self.assertTrue(out["ok"])
        self.assertEqual(out["missing_status_name"], "BRAKI")
        self.assertEqual(out["shortage_qty"], 3.0)
        self.assertEqual(order.order_ui_status_id, 77)
        self.assertEqual(oi.wms_picking_line_status, "missing")
        self.assertGreater(oi.wms_shortage_declared_qty, 0)
        append_ev.assert_called_once()
        recompute.assert_called_once()


if __name__ == "__main__":
    unittest.main()
