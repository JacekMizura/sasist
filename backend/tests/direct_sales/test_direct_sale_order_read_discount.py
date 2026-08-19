"""Regression — order detail must not subtract order discount twice for direct sales."""

from __future__ import annotations

import json
import unittest

from backend.api.order import (
    _direct_sale_order_discount_allocated_in_lines,
    _order_item_meta_dict,
)
from backend.models.order_item import OrderItem
from types import SimpleNamespace


class TestDirectSaleOrderReadDiscount(unittest.TestCase):
    def test_allocated_lines_detected(self):
        item = SimpleNamespace(
            quantity=1,
            metadata_json=json.dumps({"order_discount_allocation_gross": 5.0}),
        )
        self.assertTrue(_direct_sale_order_discount_allocated_in_lines([item]))  # type: ignore[list-item]

    def test_line_without_allocation_not_detected(self):
        item = SimpleNamespace(
            quantity=1,
            metadata_json=json.dumps({"line_discount_gross": 5.0}),
        )
        self.assertFalse(_direct_sale_order_discount_allocated_in_lines([item]))  # type: ignore[list-item]

    def test_returns_use_final_unit_price_not_double_discounted(self):
        """Returns snapshot unit_price must reflect final sale net (metadata gross is final)."""
        item = SimpleNamespace(
            quantity=2,
            unit_price=40.0,
            total_price=80.0,
            vat_percent=0.0,
            metadata_json=json.dumps(
                {
                    "line_gross_total": 80.0,
                    "line_discount_gross": 10.0,
                    "order_discount_allocation_gross": 10.0,
                }
            ),
        )
        meta = _order_item_meta_dict(item)  # type: ignore[arg-type]
        self.assertEqual(float(meta["line_gross_total"]), 80.0)
        self.assertEqual(float(item.unit_price) * int(item.quantity), 80.0)


if __name__ == "__main__":
    unittest.main()
