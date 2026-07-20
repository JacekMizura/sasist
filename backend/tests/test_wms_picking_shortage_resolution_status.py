"""
Po zgłoszeniu braku: remaining = required − picked − shortage; resolution_status=SHORTAGE.

  python -m pytest backend/tests/test_wms_picking_shortage_resolution_status.py -q
"""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.schemas.picking_routing import PickListRow
from backend.schemas.wms_picking_products import WmsPickingProductLine
from backend.services.wms_picking_product_list_service import (
    _picking_line_resolution_status,
    _picking_product_line_session_sort_key,
    build_wms_picking_product_lines,
)

_COMMON_PATCHES = [
    patch("backend.services.wms_picking_product_list_service.build_bundle_ux_index_for_orders", return_value={}),
    patch(
        "backend.services.order_consolidation.consolidation_context.consolidation_shelf_labels_by_product",
        return_value={},
    ),
    patch("backend.services.wms_picking_product_list_service._bundle_breakdown_for_product", return_value=[]),
    patch("backend.services.wms_picking_product_list_service._allocations_by_product_from_orders", return_value={}),
    patch("backend.services.wms_picking_product_list_service._picked_location_code_by_product", return_value={}),
    patch("backend.services.wms_picking_product_list_service._build_cohort_missing_line_rows", return_value=[]),
    patch("backend.services.wms_picking_product_list_service._scanner_active_by_product_id", return_value={}),
    patch("backend.services.wms_picking_product_list_service._inventory_sums_by_product_location", return_value={}),
]


class TestPickingLineResolutionStatus(unittest.TestCase):
    def test_active_partial_completed_shortage(self):
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=1, picked_quantity=0, missing_quantity=0),
            "ACTIVE",
        )
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=4, picked_quantity=0, missing_quantity=1),
            "PARTIAL",
        )
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=2, picked_quantity=3, missing_quantity=0),
            "PARTIAL",
        )
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=2, picked_quantity=2, missing_quantity=1),
            "PARTIAL",
        )
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=0, picked_quantity=1, missing_quantity=0),
            "COMPLETED_PICK",
        )
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=0, picked_quantity=0, missing_quantity=1),
            "SHORTAGE",
        )
        self.assertEqual(
            _picking_line_resolution_status(remaining_to_pick=0, picked_quantity=3, missing_quantity=2),
            "SHORTAGE",
        )

    def test_sort_order_active_partial_completed_shortage(self):
        lines = [
            WmsPickingProductLine(
                product_id=4,
                name="S",
                total_quantity=1,
                picked_quantity=0,
                missing_quantity=1,
                remaining_to_pick=0,
                completed=True,
                resolution_status="SHORTAGE",
                route_sort_key="Z",
            ),
            WmsPickingProductLine(
                product_id=3,
                name="C",
                total_quantity=1,
                picked_quantity=1,
                missing_quantity=0,
                remaining_to_pick=0,
                completed=True,
                resolution_status="COMPLETED_PICK",
                route_sort_key="A",
            ),
            WmsPickingProductLine(
                product_id=2,
                name="P",
                total_quantity=5,
                picked_quantity=2,
                missing_quantity=0,
                remaining_to_pick=3,
                completed=False,
                resolution_status="PARTIAL",
                route_sort_key="B",
            ),
            WmsPickingProductLine(
                product_id=1,
                name="A",
                total_quantity=1,
                picked_quantity=0,
                missing_quantity=0,
                remaining_to_pick=1,
                completed=False,
                resolution_status="ACTIVE",
                route_sort_key="C",
            ),
        ]
        sorted_lines = sorted(lines, key=_picking_product_line_session_sort_key)
        self.assertEqual([ln.product_id for ln in sorted_lines], [1, 2, 3, 4])


class TestProductLinesShortageResolution(unittest.TestCase):
    def _run_build(self, *, demand, picked, missing, cart_id=10):
        routing = MagicMock()
        routing.pick_list = []
        routing.shortfalls = []
        routing.warnings = []

        with patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[101],
        ), patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=MagicMock(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value=demand,
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value=missing,
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value=picked,
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=MagicMock(build_location_pick_list=MagicMock(return_value=routing)),
        ), patch(
            "backend.services.wms_picking_product_list_service.Product",
        ) as ProdMock:
            db = MagicMock()
            # Product query
            p = MagicMock()
            p.id = 346
            p.name = "X"
            p.ean = "5905108775698"
            p.image_url = None
            db.query.return_value.filter.return_value.all.return_value = [p]
            for pat in _COMMON_PATCHES:
                pat.start()
            try:
                return build_wms_picking_product_lines(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    source_status_id=1,
                    order_type="all",
                    cart_id=cart_id,
                )
            finally:
                for pat in reversed(_COMMON_PATCHES):
                    pat.stop()

    def test_full_shortage_remaining_zero_status_shortage(self):
        resp = self._run_build(
            demand={346: 1.0},
            picked={346: 0.0},
            missing={346: 1.0},
        )
        self.assertEqual(len(resp.products), 1)
        ln = resp.products[0]
        self.assertEqual(ln.remaining_to_pick, 0.0)
        self.assertEqual(ln.missing_quantity, 1.0)
        self.assertTrue(ln.completed)
        self.assertEqual(ln.resolution_status, "SHORTAGE")

    def test_partial_pick_and_shortage_still_active(self):
        resp = self._run_build(
            demand={346: 5.0},
            picked={346: 2.0},
            missing={346: 1.0},
        )
        ln = resp.products[0]
        self.assertEqual(ln.remaining_to_pick, 2.0)
        self.assertEqual(ln.missing_quantity, 1.0)
        self.assertEqual(ln.picked_quantity, 2.0)
        self.assertFalse(ln.completed)
        self.assertEqual(ln.resolution_status, "PARTIAL")

    def test_picked_plus_shortage_closes_as_shortage(self):
        resp = self._run_build(
            demand={346: 5.0},
            picked={346: 3.0},
            missing={346: 2.0},
        )
        ln = resp.products[0]
        self.assertEqual(ln.remaining_to_pick, 0.0)
        self.assertEqual(ln.resolution_status, "SHORTAGE")

    def test_full_pick_completed_pick(self):
        routing_row = PickListRow(
            location_id=1,
            location_code="A13-B-1",
            product_id=346,
            total_quantity=1.0,
            baskets=[],
        )
        routing = MagicMock()
        routing.pick_list = [routing_row]
        routing.shortfalls = []
        routing.warnings = []

        with patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[101],
        ), patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=MagicMock(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value={346: 1.0},
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value={},
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value={346: 1.0},
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=MagicMock(build_location_pick_list=MagicMock(return_value=routing)),
        ):
            db = MagicMock()
            p = MagicMock()
            p.id = 346
            p.name = "X"
            p.ean = "1"
            p.image_url = None
            db.query.return_value.filter.return_value.all.return_value = [p]
            for pat in _COMMON_PATCHES:
                pat.start()
            try:
                resp = build_wms_picking_product_lines(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    source_status_id=1,
                    order_type="all",
                    cart_id=10,
                )
            finally:
                for pat in reversed(_COMMON_PATCHES):
                    pat.stop()
        ln = resp.products[0]
        self.assertEqual(ln.resolution_status, "COMPLETED_PICK")
        self.assertEqual(ln.remaining_to_pick, 0.0)


if __name__ == "__main__":
    unittest.main()
