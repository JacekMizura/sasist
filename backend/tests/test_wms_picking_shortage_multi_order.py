"""
Multi-order agregat EAN: rozdział FE_MISSING po liniach (budget FIFO po Order.id).

  python -m pytest backend/tests/test_wms_picking_shortage_multi_order.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_picking_product_list_service import report_wms_picking_product_shortage


def _oi(*, oid: int, order_id: int, product_id: int, qty: float, missing: float = 0.0, picked: float = 0.0):
    return SimpleNamespace(
        id=oid,
        order_id=order_id,
        product_id=product_id,
        quantity=qty,
        wms_picking_line_missing_qty=missing,
        wms_shortage_declared_qty=missing,
        wms_picking_line_status=None,
        replaced_from_order_item_id=None,
        oms_line_status=None,
        product=SimpleNamespace(name=f"P{product_id}", sku=None, symbol=None, ean=None),
        _picked=picked,
    )


class MultiOrderShortageAllocationTests(unittest.TestCase):
    def test_remaining_three_across_three_orders_fifo_by_order_id(self):
        """
        #1001×2 picked=2, #1002×1 rem=1, #1003×2 rem=2 → agregat rem=3.
        Zgłoszenie shortage=3 bez order_item_id → FE_MISSING 1 + 2 (kolejność Order.id).
        """
        pid = 50
        oi1 = _oi(oid=11, order_id=1001, product_id=pid, qty=2.0, picked=2.0)
        oi2 = _oi(oid=12, order_id=1002, product_id=pid, qty=1.0, picked=0.0)
        oi3 = _oi(oid=13, order_id=1003, product_id=pid, qty=2.0, picked=0.0)
        o1 = SimpleNamespace(id=1001, items=[oi1], cart_id=9, warehouse_id=1, tenant_id=1)
        o2 = SimpleNamespace(id=1002, items=[oi2], cart_id=9, warehouse_id=1, tenant_id=1)
        o3 = SimpleNamespace(id=1003, items=[oi3], cart_id=9, warehouse_id=1, tenant_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1)

        picked_by_line = {11: 2.0, 12: 0.0, 13: 0.0}
        missing_events: list[tuple[int, float]] = []

        def sum_pick(db, line_id, cart_id):
            return float(picked_by_line.get(int(line_id), 0.0))

        def append_event(db, *, order_item_id, event_type, quantity, metadata=None):
            missing_events.append((int(order_item_id), float(quantity)))

        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            q.options.return_value = q
            q.order_by.return_value = q
            from backend.models.cart import Cart
            from backend.models.order import Order

            if model is Cart:
                q.first.return_value = cart
            elif model is Order:
                q.all.return_value = [o1, o2, o3]
                q.first.return_value = o1
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = query_side

        with patch(
            "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
            return_value=(MagicMock(), {"workflow_scoped": False, "workflow_type": "cohort", "resolved_source_status_id": 1}),
        ), patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[1001, 1002, 1003],
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            side_effect=sum_pick,
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_line_events",
            return_value=0.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.append_event",
            side_effect=append_event,
        ), patch(
            "backend.services.wms_picking_product_list_service.sync_declared_shortage_column_from_missing_events",
        ), patch(
            "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
        ), patch(
            "backend.services.wms_picking_product_list_service.touch_picking_in_progress",
        ), patch(
            "backend.services.wms_audit_service.emit_line_shortage_reported",
        ), patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
            return_value=[],
        ), patch(
            "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
            return_value=set(),
        ):
            out = report_wms_picking_product_shortage(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=1,
                order_type="all",
                product_id=pid,
                location_id=None,
                missing_qty=3.0,
                cart_id=9,
                ui_order_ids=[1001, 1002, 1003],
            )

        self.assertTrue(out["ok"])
        # #1001: remaining=0 → brak FE_MISSING; #1002:1; #1003:2
        self.assertEqual(missing_events, [(12, 1.0), (13, 2.0)])
        self.assertEqual(float(oi2.wms_shortage_declared_qty), 1.0)
        self.assertEqual(float(oi3.wms_shortage_declared_qty), 2.0)
        self.assertEqual(float(oi1.wms_shortage_declared_qty), 0.0)

    def test_order_item_id_scopes_to_single_line_cap(self):
        """Gdy FE przekaże order_item_id — budget tylko na tę linię (max=jej declarable)."""
        pid = 50
        oi2 = _oi(oid=12, order_id=1002, product_id=pid, qty=1.0, picked=0.0)
        oi3 = _oi(oid=13, order_id=1003, product_id=pid, qty=2.0, picked=0.0)
        o2 = SimpleNamespace(id=1002, items=[oi2], cart_id=9, warehouse_id=1, tenant_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1)
        missing_events: list[tuple[int, float]] = []

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
                q.first.return_value = oi2
            elif model is Cart:
                q.first.return_value = cart
            elif model is Order:
                q.all.return_value = [o2]
                q.first.return_value = o2
            else:
                q.first.return_value = None
                q.all.return_value = []
            return q

        db.query.side_effect = query_side

        with patch(
            "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
            return_value=(MagicMock(), {"workflow_scoped": True, "workflow_type": "line", "resolved_source_status_id": 1, "order_id": 1002}),
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_pick_events_for_line_cart",
            return_value=0.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.sum_line_events",
            return_value=0.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.append_event",
            side_effect=lambda db, **kw: missing_events.append((int(kw["order_item_id"]), float(kw["quantity"]))),
        ), patch(
            "backend.services.wms_picking_product_list_service.sync_declared_shortage_column_from_missing_events",
        ), patch(
            "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
        ), patch(
            "backend.services.wms_picking_product_list_service.touch_picking_in_progress",
        ), patch(
            "backend.services.wms_audit_service.emit_line_shortage_reported",
        ), patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.upsert_order_issue_tasks_from_shortage",
            return_value=[],
        ), patch(
            "backend.services.wms_picking_product_list_service._allowed_pick_location_ids_for_product",
            return_value=set(),
        ):
            with self.assertRaises(ValueError) as ctx:
                report_wms_picking_product_shortage(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    source_status_id=1,
                    order_type="all",
                    product_id=pid,
                    location_id=None,
                    missing_qty=3.0,
                    cart_id=9,
                    order_item_id=12,
                )
        self.assertIn("1", str(ctx.exception))
        _ = oi3  # unused — scoped away by order_item_id


if __name__ == "__main__":
    unittest.main()
