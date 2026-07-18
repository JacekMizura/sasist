"""
Sesja zbierania: completed SKU zostają na product-lines (snapshot demandu wózka).

  python -m pytest backend/tests/test_wms_picking_session_keeps_completed_products.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.picking_routing import PickListRow
from backend.schemas.wms_picking_products import WmsPickingProductLine
from backend.services.cart_picking_lifecycle_service import compute_session_stats_from_product_lines
from backend.services.wms_picking_product_list_service import build_wms_picking_product_lines

_COMMON_PATCHES = [
    patch("backend.services.wms_picking_product_list_service.build_bundle_ux_index_for_orders", return_value={}),
    patch(
        "backend.services.order_consolidation.consolidation_context.consolidation_shelf_labels_by_product",
        return_value={},
    ),
    patch("backend.services.wms_picking_product_list_service._bundle_breakdown_for_product", return_value=[]),
    patch("backend.services.wms_picking_product_list_service._picked_location_code_by_product", return_value={}),
    patch("backend.services.wms_picking_product_list_service._build_cohort_missing_line_rows", return_value=[]),
    patch("backend.services.wms_picking_product_list_service._scanner_active_by_product_id", return_value={}),
    patch("backend.services.wms_picking_product_list_service._inventory_sums_by_product_location", return_value={}),
]


def _line(
    pid: int,
    *,
    total: float,
    picked: float,
    remaining: float,
    route: str = "A",
    missing: float = 0.0,
) -> WmsPickingProductLine:
    return WmsPickingProductLine(
        product_id=pid,
        name=f"P{pid}",
        total_quantity=total,
        picked_quantity=picked,
        missing_quantity=missing,
        remaining_to_pick=remaining,
        completed=remaining <= 1e-9,
        primary_location_code=route,
        route_sort_key=route,
    )


class TestSessionKeepsCompletedProducts(unittest.TestCase):
    def _routing_mock(self, loc_by_pid: dict[int, str] | None = None):
        routing = MagicMock()
        rows = []
        for pid, code in (loc_by_pid or {}).items():
            rows.append(
                PickListRow(
                    product_id=pid,
                    location_id=100 + pid,
                    location_code=code,
                    total_quantity=1.0,
                )
            )
        routing.pick_list = rows
        routing.warnings = []
        routing.shortfalls = []
        svc = MagicMock()
        svc.build_location_pick_list.return_value = routing
        return svc

    def _products(self, ids: list[int]):
        return [SimpleNamespace(id=i, name=f"Prod {i}", ean=f"E{i}", image_url=None) for i in ids]

    def _enter_common(self):
        for p in _COMMON_PATCHES:
            p.start()
            self.addCleanup(p.stop)

    def test_scan_one_of_five_keeps_five_completed_last(self):
        """
        SCAN → PRODUCT NADAL NA LIŚCIE → COMPLETED → NA KOŃCU LISTY.
        Zebrane: 1 · Do zebrania: 4
        """
        self._enter_common()
        pids = [1, 2, 3, 4, 5]
        demand = {i: 1.0 for i in pids}
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = self._products(pids)

        with patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[10],
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=self._routing_mock({i: f"L{i}" for i in pids}),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value=demand,
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value={},
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value={},
        ):
            before = build_wms_picking_product_lines(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=6,
                order_type="all",
                cart_id=3,
            )

        self.assertEqual(len(before.products), 5)
        self.assertTrue(all(not p.completed for p in before.products))
        self.assertEqual(before.session_stats.do_zebrania, 5)
        self.assertEqual(before.session_stats.zebrane, 0)

        with patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[10],
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=self._routing_mock({i: f"L{i}" for i in pids}),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value=demand,
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value={},
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value={1: 1.0},
        ):
            after = build_wms_picking_product_lines(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=6,
                order_type="all",
                cart_id=3,
            )

        self.assertEqual(len(after.products), 5)
        by_id = {p.product_id: p for p in after.products}
        scanned = by_id[1]
        self.assertEqual(scanned.picked_quantity, scanned.total_quantity)
        self.assertEqual(scanned.remaining_to_pick, 0.0)
        self.assertTrue(scanned.completed)
        self.assertEqual(after.products[-1].product_id, 1)
        self.assertTrue(all(not by_id[i].completed for i in (2, 3, 4, 5)))
        self.assertEqual(after.session_stats.zebrane, 1)
        self.assertEqual(after.session_stats.do_zebrania, 4)
        self.assertEqual(after.session_stats.w_trakcie, 0)

    def test_multi_qty_partial_stays_active_full_goes_last(self):
        self._enter_common()
        demand = {10: 5.0, 20: 1.0}
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = self._products([10, 20])

        common = dict(
            tenant_id=1,
            warehouse_id=1,
            source_status_id=6,
            order_type="all",
            cart_id=3,
        )

        with patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[10],
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=self._routing_mock({10: "A1", 20: "B1"}),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value=demand,
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value={},
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value={10: 1.0},
        ):
            mid = build_wms_picking_product_lines(db, **common)

        self.assertEqual(len(mid.products), 2)
        multi = next(p for p in mid.products if p.product_id == 10)
        self.assertFalse(multi.completed)
        self.assertEqual(multi.picked_quantity, 1.0)
        self.assertEqual(multi.remaining_to_pick, 4.0)
        # PARTIAL (10) after ACTIVE (20) — resolution_status sort SSOT
        self.assertEqual(mid.products[0].product_id, 20)
        self.assertEqual(mid.products[-1].product_id, 10)

        with patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[10],
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=self._routing_mock({10: "A1", 20: "B1"}),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value=demand,
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value={},
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value={10: 5.0},
        ):
            done = build_wms_picking_product_lines(db, **common)

        self.assertEqual(len(done.products), 2)
        multi_done = next(p for p in done.products if p.product_id == 10)
        self.assertTrue(multi_done.completed)
        self.assertEqual(multi_done.remaining_to_pick, 0.0)
        self.assertEqual(done.products[-1].product_id, 10)
        self.assertEqual(done.session_stats.zebrane, 1)
        self.assertEqual(done.session_stats.do_zebrania, 1)

    def test_hub_without_cart_still_filters_completed(self):
        self._enter_common()
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = self._products([1, 2])

        with patch(
            "backend.services.wms_picking_product_list_service.get_or_create_wms_picking_shortage_settings",
            return_value=SimpleNamespace(allow_continue_other_lines_after_shortage=True),
        ), patch(
            "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
            return_value=[10],
        ), patch(
            "backend.services.wms_picking_product_list_service.PickingRoutingService",
            return_value=self._routing_mock({2: "B"}),
        ), patch(
            "backend.services.wms_picking_product_list_service._demand_by_product_from_orders",
            return_value={1: 1.0, 2: 1.0},
        ), patch(
            "backend.services.wms_picking_product_list_service._missing_qty_by_product_from_orders",
            return_value={},
        ), patch(
            "backend.services.wms_picking_product_list_service._picked_by_product",
            return_value={1: 1.0},
        ):
            resp = build_wms_picking_product_lines(
                db,
                tenant_id=1,
                warehouse_id=1,
                source_status_id=6,
                order_type="all",
                cart_id=None,
            )

        self.assertEqual(len(resp.products), 1)
        self.assertEqual(resp.products[0].product_id, 2)
        self.assertFalse(resp.products[0].completed)

    def test_session_stats_contract(self):
        lines = [
            _line(1, total=1, picked=1, remaining=0, route="A"),
            _line(2, total=1, picked=0, remaining=1, route="B"),
            _line(3, total=5, picked=2, remaining=3, route="C"),
        ]
        stats = compute_session_stats_from_product_lines(lines)
        self.assertEqual(stats["zebrane"], 1)
        self.assertEqual(stats["do_zebrania"], 1)
        self.assertEqual(stats["w_trakcie"], 1)


if __name__ == "__main__":
    unittest.main()
