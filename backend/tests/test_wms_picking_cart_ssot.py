"""
Regresja SSOT: Panel vs WMS — z cart_id lista produktów / licznik = list_orders_on_cart.

  python -m pytest backend/tests/test_wms_picking_cart_ssot.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_picking_product_list_service import (
    resolve_wms_picking_order_ids,
    build_wms_picking_product_lines,
)


class TestResolveWmsPickingOrderIdsSsot(unittest.TestCase):
    @patch("backend.services.cart_stats_service.list_orders_on_cart")
    def test_with_cart_id_uses_list_orders_on_cart_not_status_cohort(self, mock_ssot):
        mock_ssot.return_value = [
            SimpleNamespace(id=1),
            SimpleNamespace(id=2),
            SimpleNamespace(id=3),
            SimpleNamespace(id=4),
            SimpleNamespace(id=5),
        ]
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = SimpleNamespace(id=42)

        with patch(
            "backend.services.wms_picking_product_list_service._query_order_ids_for_status"
        ) as mock_cohort:
            mock_cohort.return_value = list(range(1, 11))  # 10 w statusie
            out = resolve_wms_picking_order_ids(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=7,
                order_type="all",
                cart_id=42,
            )
            mock_cohort.assert_not_called()

        self.assertEqual(out, [1, 2, 3, 4, 5])
        mock_ssot.assert_called_once()

    @patch("backend.services.wms_picking_product_list_service._query_order_ids_for_status")
    def test_without_cart_id_uses_status_cohort(self, mock_cohort):
        mock_cohort.return_value = list(range(1, 11))
        db = MagicMock()
        out = resolve_wms_picking_order_ids(
            db,
            tenant_id=1,
            warehouse_id=1,
            source_status_id=7,
            order_type="all",
            cart_id=None,
        )
        self.assertEqual(out, list(range(1, 11)))
        mock_cohort.assert_called_once()


class TestProductLinesIgnoreStatusCohortWhenCartBound(unittest.TestCase):
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
    @patch("backend.services.wms_picking_product_list_service._picked_by_product", return_value={10: 1.0})
    @patch("backend.services.wms_picking_product_list_service.PickingRoutingService")
    @patch(
        "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
        return_value={10: 1.0},
    )
    @patch(
        "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
        return_value={},
    )
    @patch(
        "backend.services.wms_picking_product_list_service._allocations_by_product_from_orders",
        return_value={},
    )
    @patch(
        "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
        return_value=[1, 2, 3, 4, 5],
    )
    @patch("backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings")
    def test_capacity_truncated_5_of_10_product_lines_count_is_5(
        self,
        mock_ss,
        mock_resolve,
        _mock_alloc,
        _mock_missing,
        mock_demand,
        mock_routing_cls,
        *_rest,
    ):
        """Panel=5 (SSOT) → cohort_order_count z product-lines = 5, nie pełna kohorta statusu."""
        mock_ss.return_value = SimpleNamespace(allow_continue_other_lines_after_shortage=True)
        mock_routing_cls.return_value = self._routing_mock()

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(id=10, name="SKU", ean=None, image_url=None),
        ]

        with patch(
            "backend.services.wms_picking_product_list_service._query_order_ids_for_status",
            return_value=list(range(1, 11)),
        ) as mock_cohort:
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=7,
                order_type="all",
                cart_id=9,
            )
            mock_cohort.assert_not_called()

        self.assertEqual(resp.cohort_order_count, 5)
        mock_resolve.assert_called_once()
        self.assertEqual(mock_resolve.call_args.kwargs.get("cart_id"), 9)
        called_ids = mock_demand.call_args[0][1]
        self.assertEqual(called_ids, [1, 2, 3, 4, 5])


if __name__ == "__main__":
    unittest.main()
