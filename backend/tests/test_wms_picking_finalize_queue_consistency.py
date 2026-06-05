"""
Spójność kolejki zbierania po finalize wózka.

  python -m pytest backend/tests/test_wms_picking_finalize_queue_consistency.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.wms_picking_products import WmsPickingProductLine
from backend.services.wms_picking_product_list_service import (
    _filter_fixed_order_ids_to_picking_queue,
    _order_ids_for_cart_finalize,
    _picking_product_line_still_active,
    _picking_queue_eligibility_clauses,
    _query_order_ids_for_status,
    _sync_order_operational_state_after_picking_finalize,
    build_wms_picking_product_lines,
)


class TestPickingQueueEligibility(unittest.TestCase):
    def test_eligibility_clauses_include_picking_finished_guard(self):
        clauses = _picking_queue_eligibility_clauses()
        self.assertEqual(len(clauses), 3)

    @patch("backend.services.wms_picking_product_list_service._query_order_ids_for_status")
    def test_fixed_order_ids_intersect_eligible_cohort(self, mock_query):
        mock_query.return_value = [10, 20]
        db = MagicMock()
        out = _filter_fixed_order_ids_to_picking_queue(
            db,
            [10, 30],
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
        )
        self.assertEqual(out, [10])

    @patch("backend.services.wms_picking_product_list_service._query_order_ids_for_status")
    def test_cart_finalize_scope_uses_cart_assignment_and_picks(self, mock_cohort):
        mock_cohort.return_value = [100, 200, 300]
        db = MagicMock()
        order_q = MagicMock()
        order_q.filter.return_value.all.return_value = [(100,)]
        pick_q = MagicMock()
        pick_q.filter.return_value.distinct.return_value.all.return_value = [(200,)]

        def query_side(arg):
            key = getattr(arg, "key", None)
            if key == "id":
                return order_q
            if key == "order_id":
                return pick_q
            return MagicMock()

        db.query.side_effect = query_side
        out = _order_ids_for_cart_finalize(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            cart_id=9,
        )
        self.assertEqual(out, [100, 200])

    @patch("backend.services.wms_picking_product_list_service._query_order_ids_for_status")
    def test_case_d_cart_scope_no_duplicate_when_on_cart_and_pick(self, mock_cohort):
        """Case D: ten sam order na wózku i w Pick — jedna pozycja w finalize scope."""
        mock_cohort.return_value = [100]
        db = MagicMock()
        order_q = MagicMock()
        order_q.filter.return_value.all.return_value = [(100,)]
        pick_q = MagicMock()
        pick_q.filter.return_value.distinct.return_value.all.return_value = [(100,)]

        def query_side(arg):
            key = getattr(arg, "key", None)
            if key == "id":
                return order_q
            if key == "order_id":
                return pick_q
            return MagicMock()

        db.query.side_effect = query_side
        out = _order_ids_for_cart_finalize(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            cart_id=9,
        )
        self.assertEqual(out, [100])


class TestPickingProductLineVisibility(unittest.TestCase):
    def test_full_pick_line_not_active(self):
        ln = WmsPickingProductLine(
            product_id=1,
            name="SKU",
            total_quantity=2.0,
            picked_quantity=2.0,
            missing_quantity=0.0,
            remaining_to_pick=0.0,
        )
        self.assertFalse(_picking_product_line_still_active(ln))

    def test_partial_pick_line_still_active(self):
        ln = WmsPickingProductLine(
            product_id=1,
            name="SKU",
            total_quantity=2.0,
            picked_quantity=1.0,
            missing_quantity=0.0,
            remaining_to_pick=1.0,
        )
        self.assertTrue(_picking_product_line_still_active(ln))

    def test_shortage_only_line_still_active(self):
        ln = WmsPickingProductLine(
            product_id=1,
            name="SKU",
            total_quantity=2.0,
            picked_quantity=0.0,
            missing_quantity=2.0,
            remaining_to_pick=0.0,
        )
        self.assertTrue(_picking_product_line_still_active(ln))


class TestBuildLinesAfterFinalize(unittest.TestCase):
    def _routing_mock(self):
        routing = MagicMock()
        routing.pick_list = []
        routing.warnings = []
        routing.shortfalls = []
        svc = MagicMock()
        svc.build_location_pick_list.return_value = routing
        return svc

    @patch("backend.services.wms_picking_product_list_service._build_cohort_missing_line_rows", return_value=[])
    @patch("backend.services.wms_picking_product_list_service._scanner_active_by_product_id", return_value={})
    @patch("backend.services.wms_picking_product_list_service._inventory_sums_by_product_location", return_value={})
    @patch("backend.services.wms_picking_product_list_service._picked_by_product", return_value={197: 2.0})
    @patch("backend.services.wms_picking_product_list_service.PickingRoutingService")
    @patch("backend.services.wms_picking_product_list_service._demand_by_product_from_orders", return_value={197: 2.0})
    @patch("backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders", return_value={})
    @patch("backend.services.wms_picking_product_list_service._query_order_ids_for_status", return_value=[501])
    @patch("backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings")
    def test_case_a_full_pick_finalize_queue_empty_products(
        self,
        mock_ss,
        _mock_orders,
        _mock_missing,
        _mock_demand,
        mock_routing_cls,
        *_rest,
    ):
        """Case A: pełna zbiórka → brak produktów w liście (remaining=0)."""
        mock_ss.return_value = SimpleNamespace(allow_continue_other_lines_after_shortage=True)
        mock_routing_cls.return_value = self._routing_mock()

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=197, name="Laces", ean="590", image_url=None),
        ]

        resp = build_wms_picking_product_lines(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            cart_id=9,
        )
        self.assertEqual(resp.cohort_order_count, 1)
        self.assertEqual(resp.products, [])

    @patch("backend.services.wms_picking_product_list_service._build_cohort_missing_line_rows", return_value=[])
    @patch("backend.services.wms_picking_product_list_service._scanner_active_by_product_id", return_value={197: True})
    @patch("backend.services.wms_picking_product_list_service._inventory_sums_by_product_location", return_value={})
    @patch("backend.services.wms_picking_product_list_service._picked_by_product", return_value={197: 1.0})
    @patch("backend.services.wms_picking_product_list_service.PickingRoutingService")
    @patch("backend.services.wms_picking_product_list_service._demand_by_product_from_orders", return_value={197: 2.0})
    @patch("backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders", return_value={})
    @patch("backend.services.wms_picking_product_list_service._query_order_ids_for_status", return_value=[501])
    @patch("backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings")
    def test_case_b_partial_pick_still_visible(
        self,
        mock_ss,
        _mock_orders,
        _mock_missing,
        _mock_demand,
        mock_routing_cls,
        *_rest,
    ):
        """Case B: częściowa zbiórka → produkt nadal w kolejce."""
        mock_ss.return_value = SimpleNamespace(allow_continue_other_lines_after_shortage=True)
        mock_routing_cls.return_value = self._routing_mock()

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=197, name="Laces", ean="590", image_url=None),
        ]

        resp = build_wms_picking_product_lines(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            cart_id=9,
        )
        self.assertEqual(len(resp.products), 1)
        self.assertGreater(resp.products[0].remaining_to_pick, 0.0)


class TestSyncAfterFinalize(unittest.TestCase):
    def test_fully_picked_line_marked_picked(self):
        oi = SimpleNamespace(
            id=55,
            product_id=197,
            quantity=2.0,
            wms_picking_line_missing_qty=0.0,
            wms_picking_line_status=None,
            oms_line_status=None,
            is_bundle_parent=False,
        )
        order = SimpleNamespace(id=501, items=[oi], warehouse_id=1)
        db = MagicMock()
        with patch(
            "backend.services.wms_picking_product_list_service._picked_qty_for_order_item_on_cart",
            return_value=2.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.line_shortage_qty_for_picking_finalize",
            return_value=0.0,
        ), patch(
            "backend.services.wms_picking_product_list_service.recompute_order_fulfillment",
        ) as mock_recompute:
            _sync_order_operational_state_after_picking_finalize(
                db,
                [order],
                tenant_id=1,
                warehouse_id=1,
                cart_id=9,
            )
        self.assertEqual(oi.wms_picking_line_status, "picked")
        mock_recompute.assert_called_once_with(db, 501, commit=False, session_cart_id=None)


class TestRecoveryQueueFilter(unittest.TestCase):
    @patch("backend.services.wms_picking_product_list_service._build_cohort_missing_line_rows", return_value=[])
    @patch("backend.services.wms_picking_product_list_service._scanner_active_by_product_id", return_value={})
    @patch("backend.services.wms_picking_product_list_service._inventory_sums_by_product_location", return_value={})
    @patch("backend.services.wms_picking_product_list_service._picked_by_product", return_value={301: 1.0})
    @patch("backend.services.wms_picking_product_list_service._recovery_demand_by_product_from_orders", return_value={301: 1.0})
    @patch("backend.services.wms_picking_product_list_service.PickingRoutingService")
    @patch("backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings")
    def test_case_c_recovery_complete_empty_lines(self, mock_ss, mock_routing_cls, *_):
        """Case C: recovery bez remaining → pusta lista + recovery_completed."""
        mock_ss.return_value = SimpleNamespace(allow_continue_other_lines_after_shortage=True)
        routing = MagicMock()
        routing.pick_list = []
        routing.warnings = []
        routing.shortfalls = []
        mock_routing_cls.return_value.build_location_pick_list.return_value = routing

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=301, name="Substitute", ean=None, image_url=None),
        ]

        resp = build_wms_picking_product_lines(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            cart_id=9,
            fixed_order_ids=[1196],
            recovery_mode=True,
        )
        self.assertTrue(resp.recovery_completed)
        self.assertEqual(resp.products, [])


if __name__ == "__main__":
    unittest.main()
