"""
product-lines allocations: shortage per order_item (no FIFO).

  python -m pytest backend/tests/test_wms_picking_product_line_allocations.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.schemas.wms_picking_products import WmsPickingProductAllocation, WmsPickingProductLine
from backend.services.cart_picking_lifecycle_service import compute_session_stats_from_product_lines
from backend.services.wms_picking_product_list_service import _allocations_by_product_from_orders


def _oi(oid: int, pid: int, qty: float, miss: float, oi_id: int):
    return SimpleNamespace(
        id=oi_id,
        product_id=pid,
        quantity=qty,
        wms_picking_line_missing_qty=miss,
        oms_line_status=None,
        is_bundle_commercial_header=False,
    )


def _order(oid: int, number: str, items: list, basket_name: str | None = None):
    basket = None
    if basket_name:
        basket = SimpleNamespace(id=oid, name=basket_name, row=1, column=oid)
    return SimpleNamespace(
        id=oid,
        number=number,
        basket_id=oid if basket else None,
        basket=basket,
        items=items,
        cart_id=2,
    )


class TestProductLineAllocations(unittest.TestCase):
    def test_allocations_preserve_per_order_item_shortage(self):
        """#1234 shortage 1/8, #1235 shortage 0/1 — no FIFO bleed."""
        o1 = _order(1234, "1234", [_oi(1234, 192, 8, 1, 501)], "S-1-1")
        o2 = _order(1235, "1235", [_oi(1235, 192, 1, 0, 502)], "S-1-2")
        db = MagicMock()
        q = MagicMock()
        q.options.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = [o1, o2]
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
                return_value={501: 7.0, 502: 1.0},
            ),
        ):
            by_pid = _allocations_by_product_from_orders(
                db,
                [1234, 1235],
                tenant_id=1,
                warehouse_id=1,
                cart_id=2,
            )

        rows = by_pid[192]
        self.assertEqual(len(rows), 2)
        a1234 = next(a for a in rows if a.order_id == 1234)
        a1235 = next(a for a in rows if a.order_id == 1235)
        self.assertEqual(a1234.shortage_qty, 1.0)
        self.assertEqual(a1234.required_qty, 8.0)
        self.assertEqual(a1234.picked_qty, 7.0)
        self.assertEqual(a1234.basket_label, "S-1-1")
        self.assertEqual(a1235.shortage_qty, 0.0)
        self.assertEqual(a1235.required_qty, 1.0)
        self.assertEqual(a1235.picked_qty, 1.0)

    def test_session_stats_braki_szt_and_orders(self):
        line = WmsPickingProductLine(
            product_id=1,
            name="X",
            total_quantity=9,
            picked_quantity=8,
            missing_quantity=1,
            remaining_to_pick=0,
            completed=True,
            resolution_status="SHORTAGE",
            primary_location_code="A",
            allocations=[
                WmsPickingProductAllocation(
                    order_id=1234,
                    order_number="1234",
                    order_item_id=1,
                    basket_label="S-1-1",
                    required_qty=8,
                    picked_qty=7,
                    shortage_qty=1,
                    unresolved_qty=0,
                ),
                WmsPickingProductAllocation(
                    order_id=1235,
                    order_number="1235",
                    order_item_id=2,
                    basket_label="S-1-2",
                    required_qty=1,
                    picked_qty=1,
                    shortage_qty=0,
                    unresolved_qty=0,
                ),
            ],
        )
        stats = compute_session_stats_from_product_lines([line])
        self.assertEqual(stats["braki"], 1)
        self.assertEqual(stats["braki_szt"], 1.0)
        self.assertEqual(stats["zamowienia_z_brakami"], 1)


if __name__ == "__main__":
    unittest.main()
