"""Zgłoszenie braku: linie zamiennika, dogrywka, łańcuch zamienników."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.order_item import OMS_LINE_STATUS_REPLACED, OMS_LINE_STATUS_TO_PICK
from backend.services.picking_config_query import resolve_picking_config_for_shortage_report
from backend.services.wms_picking_product_list_service import (
    _line_eligible_for_shortage_report,
    report_wms_picking_product_shortage,
)


class LineEligibleForShortageReportTests(unittest.TestCase):
    def test_archived_replaced_line_blocked(self):
        oi = SimpleNamespace(
            parent_bundle_order_item_id=None,
            oms_line_status=OMS_LINE_STATUS_REPLACED,
            quantity=1,
            replaced_from_order_item_id=None,
        )
        ok, reason = _line_eligible_for_shortage_report(oi)
        self.assertFalse(ok)
        self.assertEqual(reason, "archived_replaced_line")

    def test_substitute_line_allowed(self):
        oi = SimpleNamespace(
            parent_bundle_order_item_id=None,
            oms_line_status=OMS_LINE_STATUS_TO_PICK,
            quantity=1,
            replaced_from_order_item_id=100,
        )
        ok, reason = _line_eligible_for_shortage_report(oi)
        self.assertTrue(ok)
        self.assertEqual(reason, "active_line")

    def test_regular_line_allowed(self):
        oi = SimpleNamespace(
            parent_bundle_order_item_id=None,
            oms_line_status=None,
            quantity=2,
            replaced_from_order_item_id=None,
        )
        ok, _ = _line_eligible_for_shortage_report(oi)
        self.assertTrue(ok)

    def test_nested_substitute_zero_qty_allowed(self):
        """Zamiennik zamiennika (qty może być 0 na archiwalnej linii źródłowej)."""
        oi = SimpleNamespace(
            parent_bundle_order_item_id=None,
            oms_line_status=OMS_LINE_STATUS_TO_PICK,
            quantity=0,
            replaced_from_order_item_id=205,
        )
        ok, reason = _line_eligible_for_shortage_report(oi)
        self.assertTrue(ok)
        self.assertEqual(reason, "substitute_line")


class ResolvePickingConfigForShortageTests(unittest.TestCase):
    @patch("backend.services.picking_config_query.get_picking_config")
    def test_normal_line_uses_request_status(self, mock_get):
        pc = SimpleNamespace(source_status_id=1, id=10)
        mock_get.return_value = pc
        db = MagicMock()
        got, ctx = resolve_picking_config_for_shortage_report(
            db, tenant_id=1, warehouse_id=1, source_status_id=1
        )
        self.assertIs(got, pc)
        self.assertEqual(ctx["resolution"], "request_source_status")
        self.assertFalse(ctx["workflow_scoped"])

    @patch("backend.services.picking_config_query._first_warehouse_picking_config")
    @patch("backend.services.picking_config_query.get_picking_config")
    def test_replacement_line_falls_back_to_order_status(self, mock_get, mock_first):
        from backend.models.order import Order
        from backend.models.order_item import OrderItem

        mock_get.side_effect = lambda _db, _t, _w, sid: (
            SimpleNamespace(source_status_id=sid, id=99) if sid == 7 else None
        )
        oi = SimpleNamespace(
            id=2045,
            order_id=1206,
            replaced_from_order_item_id=2000,
            product_id=10,
        )
        order = SimpleNamespace(id=1206, order_ui_status_id=7, tenant_id=1)

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            if model is OrderItem:
                q.first.return_value = oi
            elif model is Order:
                q.first.return_value = order
            else:
                q.first.return_value = None
            q.order_by.return_value = q
            return q

        db = MagicMock()
        db.query.side_effect = query_side
        got, ctx = resolve_picking_config_for_shortage_report(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            order_item_id=2045,
        )
        self.assertIsNotNone(got)
        self.assertEqual(ctx["workflow_type"], "replacement")
        self.assertEqual(ctx["resolution"], "order_panel_status")
        self.assertEqual(ctx["replacement_item_id"], 2045)
        mock_first.assert_not_called()

    @patch("backend.services.picking_config_query._first_warehouse_picking_config")
    @patch("backend.services.picking_config_query.get_picking_config")
    def test_recovery_uses_order_status_then_warehouse_default(self, mock_get, mock_first):
        from backend.models.order import Order

        mock_get.return_value = None
        mock_first.return_value = SimpleNamespace(source_status_id=3, id=1)
        order = SimpleNamespace(id=1171, order_ui_status_id=99, tenant_id=1)

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            if model is Order:
                q.first.return_value = order
            return q

        db = MagicMock()
        db.query.side_effect = query_side
        got, ctx = resolve_picking_config_for_shortage_report(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=1,
            recovery_order_id=1171,
        )
        self.assertIsNotNone(got)
        self.assertEqual(ctx["workflow_type"], "recovery")
        self.assertEqual(ctx["resolution"], "warehouse_default")


class ReportShortageWorkflowTests(unittest.TestCase):
    """TEST 1–4: brak configu sesji nie blokuje zamiennika (workflow_scoped)."""

    def _make_db(self, oi, order, cart):
        from backend.models.cart import Cart
        from backend.models.order import Order
        from backend.models.order_item import OrderItem
        from backend.models.pick import Pick

        db = MagicMock()

        def query_side(model):
            q = MagicMock()
            q.filter.return_value = q
            if model is Cart:
                q.first.return_value = cart
            elif model is OrderItem:
                q.options.return_value.filter.return_value.first.return_value = oi
            elif model is Order:
                q.options.return_value.filter.return_value.all.return_value = [order]
            elif model is Pick:
                q.filter.return_value.all.return_value = []
                q.filter.return_value.delete.return_value = None
            return q

        db.query.side_effect = query_side
        return db

    def _run_report(self, *, order_item_id: int, replaced_from: int | None, workflow_type: str):
        oi = SimpleNamespace(
            id=order_item_id,
            order_id=500,
            product_id=77,
            quantity=1.0,
            replaced_from_order_item_id=replaced_from,
            oms_line_status=OMS_LINE_STATUS_TO_PICK,
            wms_shortage_declared_qty=0.0,
            wms_picking_line_status=None,
            parent_bundle_order_item_id=None,
            product=None,
        )
        order = SimpleNamespace(id=500, items=[oi], tenant_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1)
        db = self._make_db(oi, order, cart)
        picking_ctx = {
            "workflow_scoped": True,
            "workflow_type": workflow_type,
            "resolved_source_status_id": 7,
            "order_id": 500,
            "replacement_item_id": order_item_id if replaced_from else None,
        }

        with (
            patch(
                "backend.services.picking_config_query.resolve_picking_config_for_shortage_report",
                return_value=(None, picking_ctx),
            ),
            patch(
                "backend.services.fulfillment_event_service.sum_pick_events_for_line_cart",
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
                order_item_id=order_item_id,
            )
        self.assertTrue(out["ok"])
        self.assertEqual(out["orders_updated"], 1)

    def test_normal_line_shortage_success(self):
        self._run_report(order_item_id=100, replaced_from=None, workflow_type="line_scoped")

    def test_replacement_line_shortage_success(self):
        self._run_report(order_item_id=2045, replaced_from=2000, workflow_type="replacement")

    def test_nested_replacement_shortage_success(self):
        self._run_report(order_item_id=3001, replaced_from=3000, workflow_type="replacement")

    @patch("backend.services.picking_config_query.resolve_picking_config_for_shortage_report")
    def test_recovery_shortage_success(self, mock_resolve):
        from backend.services.wms_recovery_pick_service import get_open_recovery_task_for_order

        oi = SimpleNamespace(
            id=88,
            order_id=1171,
            product_id=77,
            quantity=1.0,
            replaced_from_order_item_id=None,
            oms_line_status=None,
            wms_shortage_declared_qty=0.0,
            wms_picking_line_status=None,
            parent_bundle_order_item_id=None,
            product=None,
        )
        order = SimpleNamespace(id=1171, items=[oi], tenant_id=1)
        cart = SimpleNamespace(id=9, tenant_id=1, warehouse_id=1)
        db = self._make_db(oi, order, cart)
        # Drugie zapytanie Order (weryfikacja dogrywki) — ten sam obiekt.
        from backend.models.order import Order

        orig_query = db.query.side_effect

        def query_side(model):
            q = orig_query(model)
            if model is Order:
                q.filter.return_value.first.return_value = order
            return q

        db.query.side_effect = query_side
        mock_resolve.return_value = (
            SimpleNamespace(source_status_id=3, id=1),
            {"workflow_scoped": True, "workflow_type": "recovery", "resolved_source_status_id": 3, "order_id": 1171},
        )
        with (
            patch(
                "backend.services.wms_recovery_pick_service.order_has_recovery_pick_work",
                return_value=True,
            ),
            patch(
                "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
                return_value=SimpleNamespace(id=1),
            ),
            patch(
                "backend.services.fulfillment_event_service.sum_pick_events_for_line_cart",
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
                recovery_order_id=1171,
                order_item_id=88,
            )
        self.assertTrue(out["ok"])
        _ = get_open_recovery_task_for_order


class RelocationOnPickedReplacementRemovalTests(unittest.TestCase):
    """TEST 5: usunięcie zebranej linii zamiennika → relocation."""

    @patch("backend.services.recovery_workflow_service.resolve_order_recovery_state")
    @patch("backend.services.wms_operational_task_service.merge_relocation_from_picks")
    @patch("backend.services.fulfillment_event_service.line_picked_sum_for_order")
    def test_picked_replacement_triggers_relocation(
        self, mock_picked_sum, mock_merge_picks, mock_recovery_state
    ):
        from backend.models.order_item import OrderItem
        from backend.models.pick import Pick
        from backend.services.braki_order_state_service import ensure_relocation_for_order_item_picks
        from backend.services.recovery_workflow_service import RecoveryLineState

        mock_recovery_state.return_value = SimpleNamespace(
            lines=[
                RecoveryLineState(
                    order_line_id=2045,
                    product_id=77,
                    ordered_qty=1.0,
                    picked_qty=2.0,
                    removed_qty=0.0,
                    replacement_qty=0.0,
                    unresolved_qty=0.0,
                    recovery_qty=0.0,
                    shortage_reported=False,
                    replacement_applied=True,
                    relocation_required=True,
                    active_recovery=False,
                    recovery_completed=True,
                    visible_in_queue=False,
                    visible_in_recovery_pick=False,
                    visible_in_relocation=True,
                    visible_in_finalize=True,
                    packing_eligible=True,
                    finalize_allowed=True,
                    reason="relocation_leftover",
                )
            ]
        )
        mock_picked_sum.return_value = 2.0
        pick = SimpleNamespace(id=1, quantity=2.0, picked_at="2026-06-04", order_item_id=2045)
        mock_merge_picks.return_value = [SimpleNamespace(id=901)]
        oi = SimpleNamespace(id=2045, order_id=500, product_id=77, quantity=1.0)
        order = SimpleNamespace(id=500, tenant_id=1, warehouse_id=1, cart_id=9)

        oi_q = MagicMock()
        oi_q.filter.return_value.first.return_value = oi
        pick_q = MagicMock()
        pick_q.filter.return_value.all.return_value = [pick]

        def query_side(model):
            if model is OrderItem:
                return oi_q
            if model is Pick:
                return pick_q
            return MagicMock()

        db = MagicMock()
        db.query.side_effect = query_side

        task_ids = ensure_relocation_for_order_item_picks(
            db,
            tenant_id=1,
            warehouse_id=1,
            order=order,
            order_item_id=2045,
            source_event_id="test:remove",
            removal_type="manual_oms",
        )
        self.assertEqual(task_ids, [901])
        mock_merge_picks.assert_called_once()


if __name__ == "__main__":
    unittest.main()
