"""
Runtime regression: allocations[] projection (read-only, no write-path).

  python -m pytest backend/tests/test_wms_picking_shortage_allocation_regression.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.wms_picking_products import WmsPickingProductAllocation, WmsPickingProductLine
from backend.services.cart_picking_lifecycle_service import compute_session_stats_from_product_lines
from backend.services.cart_service import _order_picking_shortage_projection
from backend.services.wms_picking_product_list_service import _allocations_by_product_from_orders


def _oi(order_id: int, pid: int, qty: float, miss: float, oi_id: int):
    return SimpleNamespace(
        id=oi_id,
        product_id=pid,
        quantity=qty,
        wms_picking_line_missing_qty=miss,
        oms_line_status=None,
        is_bundle_commercial_header=False,
    )


def _order(oid: int, number: str, items: list, basket_name: str):
    basket = SimpleNamespace(id=oid * 10, name=basket_name, row=1, column=oid)
    return SimpleNamespace(
        id=oid,
        number=number,
        basket_id=basket.id,
        basket=basket,
        items=items,
        cart_id=2,
    )


def _alloc_map(orders: list, picked: dict[int, float]) -> dict[int, list[WmsPickingProductAllocation]]:
    db = MagicMock()
    q = MagicMock()
    q.options.return_value = q
    q.filter.return_value = q
    q.order_by.return_value = q
    q.all.return_value = orders
    db.query.return_value = q
    with (
        patch(
            "backend.services.wms_picking_product_list_service.order_item_is_replaced_line",
            return_value=False,
        ),
        patch(
            "backend.services.wms_picking_product_list_service.order_item_skip_bundle_commercial_header_for_ops",
            return_value=False,
        ),
        patch(
            "backend.services.wms_picking_product_list_service.picked_by_order_item_from_events",
            return_value=picked,
        ),
    ):
        return _allocations_by_product_from_orders(
            db,
            [int(o.id) for o in orders],
            tenant_id=1,
            warehouse_id=1,
            cart_id=2,
        )


class TestShortageAllocationRegression(unittest.TestCase):
    def test_case_2_orders_same_sku(self):
        o1 = _order(1234, "1234", [_oi(1234, 192, 8, 1, 501)], "S-1-1")
        o2 = _order(1235, "1235", [_oi(1235, 192, 1, 0, 502)], "S-1-2")
        rows = _alloc_map([o1, o2], {501: 7.0, 502: 1.0})[192]
        self.assertEqual(len(rows), 2)
        a1 = next(r for r in rows if r.order_id == 1234)
        a2 = next(r for r in rows if r.order_id == 1235)
        self.assertEqual(
            (a1.required_qty, a1.picked_qty, a1.shortage_qty, a1.unresolved_qty),
            (8.0, 7.0, 1.0, 0.0),
        )
        self.assertEqual(a1.basket_label, "S-1-1")
        self.assertEqual(a1.order_item_id, 501)
        self.assertEqual(
            (a2.required_qty, a2.picked_qty, a2.shortage_qty, a2.unresolved_qty),
            (1.0, 1.0, 0.0, 0.0),
        )
        self.assertEqual(a2.basket_label, "S-1-2")
        # Aggregate
        req = sum(r.required_qty for r in rows)
        picked = sum(r.picked_qty for r in rows)
        short = sum(r.shortage_qty for r in rows)
        unr = sum(r.unresolved_qty for r in rows)
        self.assertEqual((req, picked, short, unr), (9.0, 8.0, 1.0, 0.0))
        # #1235 must not be shortage-affected
        self.assertEqual([r.order_id for r in rows if r.shortage_qty > 0], [1234])

    def test_case_5_orders_aggregate_and_full_allocations(self):
        specs = [
            (1, 1.0, 1.0, 0.0, "S-1-1"),
            (2, 1.0, 1.0, 0.0, "S-1-2"),
            (3, 2.0, 2.0, 0.0, "S-1-3"),
            (4, 8.0, 4.0, 4.0, "S-1-4"),
            (5, 8.0, 0.0, 8.0, "S-1-5"),
        ]
        orders = []
        picked = {}
        for i, (oid, req, pk, miss, basket) in enumerate(specs, start=1):
            oi_id = 100 + i
            orders.append(_order(oid, str(oid), [_oi(oid, 10, req, miss, oi_id)], basket))
            picked[oi_id] = pk
        rows = _alloc_map(orders, picked)[10]
        self.assertEqual(len(rows), 5)
        self.assertEqual(sum(r.required_qty for r in rows), 20.0)
        self.assertEqual(sum(r.picked_qty for r in rows), 8.0)
        self.assertEqual(sum(r.shortage_qty for r in rows), 12.0)
        self.assertEqual(sum(r.unresolved_qty for r in rows), 0.0)
        affected = [r for r in rows if r.shortage_qty > 0]
        self.assertEqual([(r.order_id, r.shortage_qty) for r in affected], [(4, 4.0), (5, 8.0)])
        # Basket from order assignment, not product_id
        by_oid = {r.order_id: r.basket_label for r in rows}
        self.assertEqual(by_oid[4], "S-1-4")
        self.assertEqual(by_oid[5], "S-1-5")
        line = WmsPickingProductLine(
            product_id=10,
            name="A",
            total_quantity=20,
            picked_quantity=8,
            missing_quantity=12,
            remaining_to_pick=0,
            completed=True,
            resolution_status="SHORTAGE",
            primary_location_code="A",
            allocations=rows,
        )
        stats = compute_session_stats_from_product_lines([line])
        self.assertEqual(stats["braki_szt"], 12.0)
        self.assertEqual(stats["zamowienia_z_brakami"], 2)
        self.assertEqual(stats["braki"], 1)  # SKU count

    def test_partial_unresolved_not_ready(self):
        o = _order(4, "4", [_oi(4, 10, 8, 2, 14)], "S-1-4")
        rows = _alloc_map([o], {14: 4.0})[10]
        a = rows[0]
        self.assertEqual(
            (a.required_qty, a.picked_qty, a.shortage_qty, a.unresolved_qty),
            (8.0, 4.0, 2.0, 2.0),
        )
        self.assertGreater(a.unresolved_qty, 0)

    def test_full_shortage_points_at_order_item_basket(self):
        o = _order(5, "5", [_oi(5, 10, 8, 8, 15)], "S-1-5")
        rows = _alloc_map([o], {15: 0.0})[10]
        a = rows[0]
        self.assertEqual(a.order_id, 5)
        self.assertEqual(a.order_item_id, 15)
        self.assertEqual(a.basket_label, "S-1-5")
        self.assertEqual(a.shortage_qty, 8.0)
        self.assertEqual(a.picked_qty, 0.0)
        self.assertEqual(a.unresolved_qty, 0.0)

    def test_basket_not_mapped_by_product_id(self):
        """Same SKU → two baskets from two orders."""
        o1 = _order(10, "10", [_oi(10, 99, 3, 0, 1)], "S-2-1")
        o2 = _order(11, "11", [_oi(11, 99, 3, 1, 2)], "S-9-9")
        rows = _alloc_map([o1, o2], {1: 3.0, 2: 2.0})[99]
        self.assertEqual({r.basket_label for r in rows}, {"S-2-1", "S-9-9"})
        self.assertEqual(next(r for r in rows if r.order_id == 11).basket_label, "S-9-9")

    def test_cart_projection_status_formula(self):
        oi_ready = _oi(1, 1, 1, 0, 1)
        oi_short = _oi(2, 1, 8, 1, 2)
        oi_partial = _oi(3, 1, 8, 2, 3)
        ready_order = SimpleNamespace(items=[oi_ready])
        short_order = SimpleNamespace(items=[oi_short])
        partial_order = SimpleNamespace(items=[oi_partial])

        self.assertEqual(
            _order_picking_shortage_projection(short_order)["picking_status"],
            "INCOMPLETE",
        )

        db = MagicMock()
        with patch(
            "backend.services.fulfillment_event_service.sum_pick_events_for_line_cart",
            return_value=4.0,
        ):
            proj = _order_picking_shortage_projection(partial_order, cart_id=2, db=db)
        self.assertEqual(proj["picking_status"], "INCOMPLETE")  # shortage first

        with patch(
            "backend.services.fulfillment_event_service.sum_pick_events_for_line_cart",
            return_value=4.0,
        ):
            # shortage 0, picked 4 of 8 → unresolved
            oi_u = _oi(4, 1, 8, 0, 4)
            proj2 = _order_picking_shortage_projection(
                SimpleNamespace(items=[oi_u]), cart_id=2, db=db
            )
        self.assertEqual(proj2["picking_status"], "IN_PROGRESS")
        self.assertEqual(proj2["picking_status_label"], "NIEROZLICZONE")

        with patch(
            "backend.services.fulfillment_event_service.sum_pick_events_for_line_cart",
            return_value=1.0,
        ):
            proj3 = _order_picking_shortage_projection(ready_order, cart_id=2, db=db)
        self.assertEqual(proj3["picking_status"], "READY")


if __name__ == "__main__":
    unittest.main()
