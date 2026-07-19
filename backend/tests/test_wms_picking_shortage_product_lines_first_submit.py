"""
Shortage first-submit → product-lines SHORTAGE (no second POST).

Also: request dedupe must not return a pre-mutation GET after force refresh.

  python -m pytest backend/tests/test_wms_picking_shortage_product_lines_first_submit.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_picking_product_list_service import (
    _picking_line_resolution_status,
    report_wms_picking_product_shortage,
)


class ProductLinesAfterFirstShortageSubmitTests(unittest.TestCase):
    """GET product-lines semantics after ONE report-shortage must be SHORTAGE."""

    def test_resolution_status_after_first_submit_qty_1(self):
        rem = max(0.0, 1.0 - 0.0 - 1.0)
        self.assertEqual(
            _picking_line_resolution_status(
                remaining_to_pick=rem, picked_quantity=0.0, missing_quantity=1.0
            ),
            "SHORTAGE",
        )

    def test_report_then_builder_sees_missing_via_columns(self):
        """Simulate: after report, columns + resolution match product-lines contract."""
        oi = SimpleNamespace(
            id=501,
            order_id=1214,
            product_id=77,
            quantity=1.0,
            replaced_from_order_item_id=None,
            oms_line_status=None,
            wms_shortage_declared_qty=0.0,
            wms_picking_line_missing_qty=0.0,
            wms_picking_line_status=None,
            parent_bundle_order_item_id=None,
            product=SimpleNamespace(name="SKU", ean="590", sku="S1"),
        )
        order = SimpleNamespace(id=1214, number="1214", items=[oi], tenant_id=1, cart_id=3, warehouse_id=1)
        cart = SimpleNamespace(id=3, tenant_id=1, warehouse_id=1, code="CART-0003", current_session_id=1)

        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.options.return_value = q
            q.order_by.return_value = q
            from backend.models.cart import Cart as CartModel
            from backend.models.order import Order as OrderModel
            from backend.models.order_item import OrderItem as OrderItemModel

            if model is CartModel:
                q.first.return_value = cart
            elif model is OrderItemModel:
                q.first.return_value = oi
            elif model is OrderModel:
                q.all.return_value = [order]
                q.first.return_value = order
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = query_side
        db.flush = MagicMock()

        missing_after = {"n": 0.0}

        def sum_line_side(db_arg, oid, etype):
            return float(missing_after["n"])

        def append_side(db_arg, *, order_item_id, event_type, quantity, metadata=None):
            missing_after["n"] = float(missing_after["n"]) + float(quantity)
            oi.wms_picking_line_missing_qty = float(missing_after["n"])
            oi.wms_shortage_declared_qty = float(missing_after["n"])
            oi.wms_picking_line_status = "missing"

        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(
                    None,
                    {
                        "workflow_scoped": True,
                        "workflow_type": "line_scoped",
                        "resolved_source_status_id": 6,
                    },
                ),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
                return_value=0.0,
            ),
            patch(
                "backend.services.wms_picking_product_list_service.sum_line_events",
                side_effect=sum_line_side,
            ),
            patch(
                "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
                return_value=set(),
            ),
            patch("backend.services.wms_picking_product_list_service.touch_picking_in_progress"),
            patch(
                "backend.services.wms_picking_product_list_service.append_event",
                side_effect=append_side,
            ),
            patch("backend.services.wms_picking_product_list_service.sync_declared_shortage_column_from_missing_events"),
            patch("backend.services.wms_picking_product_list_service.recompute_order_fulfillment"),
            patch("backend.services.wms_audit_service.emit_line_shortage_reported"),
            patch(
                "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
                return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
            ),
            patch(
                "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
                return_value=[],
            ),
        ):
            out = report_wms_picking_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=6,
                order_type="all",
                product_id=77,
                location_id=None,
                missing_qty=1.0,
                cart_id=3,
                order_item_id=501,
                operator_user_id=1,
            )

        self.assertTrue(out["ok"])
        self.assertFalse(out.get("already_resolved"))
        self.assertAlmostEqual(float(oi.wms_picking_line_missing_qty), 1.0)
        self.assertAlmostEqual(float(oi.wms_shortage_declared_qty), 1.0)
        rem = max(0.0, 1.0 - 0.0 - float(oi.wms_picking_line_missing_qty))
        self.assertEqual(rem, 0.0)
        self.assertEqual(
            _picking_line_resolution_status(
                remaining_to_pick=rem,
                picked_quantity=0.0,
                missing_quantity=float(oi.wms_picking_line_missing_qty),
            ),
            "SHORTAGE",
        )


if __name__ == "__main__":
    unittest.main()
