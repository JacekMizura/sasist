"""
Częściowe zbieranie (1/2) — zgłoszenie braku nadal dozwolone.

  python -m pytest backend/tests/test_report_shortage_partial_pick.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_picking_product_list_service import (
    _line_shortage_report_quantities,
    report_wms_picking_product_shortage,
)


class LineShortageReportQuantitiesTests(unittest.TestCase):
    def test_partial_pick_remaining_one(self):
        oi = SimpleNamespace(
            id=1,
            quantity=2.0,
            wms_picking_line_missing_qty=0.0,
            wms_shortage_declared_qty=0.0,
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            return_value=1.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_line_events",
            return_value=0.0,
        ):
            q = _line_shortage_report_quantities(db, oi, 9)
        self.assertEqual(q["required_qty"], 2.0)
        self.assertEqual(q["picked_qty"], 1.0)
        self.assertEqual(q["remaining_qty"], 1.0)
        # remaining + picked (konwersja draftów) = ordered − missing
        self.assertEqual(q["declarable_qty"], 2.0)

    def test_fully_picked_still_declarable_via_pick_conversion(self):
        oi = SimpleNamespace(
            id=1,
            quantity=2.0,
            wms_picking_line_missing_qty=0.0,
            wms_shortage_declared_qty=0.0,
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            return_value=2.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_line_events",
            return_value=0.0,
        ):
            q = _line_shortage_report_quantities(db, oi, 9)
        self.assertEqual(q["remaining_qty"], 0.0)
        self.assertEqual(q["declarable_qty"], 2.0)

    def test_partial_with_existing_shortage(self):
        """required=5, picked=3, missing=1 → remaining=1; declarable=4 (można też cofnąć picki)."""
        oi = SimpleNamespace(
            id=2,
            quantity=5.0,
            wms_picking_line_missing_qty=1.0,
            wms_shortage_declared_qty=1.0,
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            return_value=3.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_line_events",
            return_value=1.0,
        ):
            q = _line_shortage_report_quantities(db, oi, 9)
        self.assertEqual(q["remaining_qty"], 1.0)
        self.assertEqual(q["declarable_qty"], 4.0)


class ReportShortagePartialPickIntegrationTests(unittest.TestCase):
    def _make_db(self, oi, order, cart):
        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.options.return_value = q
            q.order_by.return_value = q
            from backend.models.cart import Cart
            from backend.models.order import Order
            from backend.models.order_item import OrderItem

            if model is OrderItem:
                q.first.return_value = oi
            elif model is Cart:
                q.first.return_value = cart
            elif model is Order:
                q.filter.return_value.all.return_value = [order]
                q.all.return_value = [order]
                q.first.return_value = order
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = query_side
        return db

    def test_report_shortage_when_one_of_two_picked(self):
        oi = SimpleNamespace(
            id=501,
            order_id=500,
            product_id=77,
            quantity=2.0,
            replaced_from_order_item_id=None,
            oms_line_status=None,
            wms_shortage_declared_qty=0.0,
            wms_picking_line_missing_qty=0.0,
            wms_picking_line_status=None,
            parent_bundle_order_item_id=None,
            product=None,
        )
        order = SimpleNamespace(id=500, items=[oi], tenant_id=1, cart_id=9)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1)
        db = self._make_db(oi, order, cart)
        picking_ctx = {
            "workflow_scoped": True,
            "workflow_type": "line_scoped",
            "resolved_source_status_id": 7,
            "order_id": 500,
        }

        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(None, picking_ctx),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
                return_value=1.0,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_line_events",
                return_value=0.0,
            ),
            patch(
                "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
                return_value=set(),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.touch_picking_in_progress",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.append_event",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sync_declared_shortage_column_from_missing_events",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.delete_pick_events_for_pick_ids",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
            ),
            patch(
                "backend.services.wms_audit_service.emit_line_shortage_reported",
            ),
            patch(
                "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
                return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
                return_value=[9001],
            ) as upsert_mock,
        ):
            out = report_wms_picking_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=77,
                location_id=None,
                missing_qty=1.0,
                cart_id=9,
                order_item_id=501,
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["orders_updated"], 1)
        self.assertEqual(out["order_issue_task_ids"], [9001])
        upsert_mock.assert_called_once()
        upsert_kwargs = upsert_mock.call_args.kwargs
        self.assertEqual(upsert_kwargs["tenant_id"], 1)
        self.assertEqual(upsert_kwargs["warehouse_id"], 1)
        self.assertEqual(upsert_kwargs["shortage_product_id"], 77)
        self.assertIn(500, upsert_kwargs["order_ids"])


if __name__ == "__main__":
    unittest.main()
