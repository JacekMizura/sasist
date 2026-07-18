"""Schema contract: bundle_component_index ge=1 rejects 0 (detail tree path)."""

from __future__ import annotations

import unittest

from pydantic import ValidationError

from backend.schemas.wms_picking_products import WmsPickingBundleComponentStatus


class TestDetailBundleTreeValidation(unittest.TestCase):
    def test_component_index_zero_fails_ge_1(self):
        with self.assertRaises(ValidationError) as ctx:
            WmsPickingBundleComponentStatus(
                order_item_id=1,
                product_id=10,
                product_name="X",
                quantity=1,
                bundle_component_index=0,
            )
        err = ctx.exception.errors()[0]
        self.assertEqual(err["type"], "greater_than_equal")
        self.assertEqual(err["input"], 0)


if __name__ == "__main__":
    unittest.main()
