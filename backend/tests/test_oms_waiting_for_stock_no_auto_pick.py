"""„Oznacz jako czeka” nie zeruje braku i nie udaje zebrania."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.order_fulfillment_recompute import (
    compute_line_missing_qty,
    line_shortage_display_kind,
)


class WaitingDoesNotCoverMissingTests(unittest.TestCase):
    def test_waiting_flag_does_not_zero_operational_missing(self):
        order = SimpleNamespace(id=1, cart_id=None)
        oi = SimpleNamespace(
            id=10,
            quantity=5,
            oms_line_status=None,
            oms_removed_qty=0.0,
            oms_replaced_qty=0.0,
            wms_shortage_declared_qty=2.0,
            metadata_json='{"oms_waiting_for_stock": true, "oms_waiting_missing_qty": 2.0}',
        )
        db = MagicMock()
        with (
            patch(
                "backend.services.order_fulfillment_recompute.line_picked_sum_for_order",
                return_value=3.0,
            ),
            patch(
                "backend.services.order_fulfillment_recompute.sum_line_events",
                return_value=2.0,
            ),
        ):
            mq = compute_line_missing_qty(db, order, oi)
        self.assertAlmostEqual(mq, 2.0)
        self.assertEqual(line_shortage_display_kind(oi, mq), "waiting")

    def test_waiting_display_kind_even_when_missing_positive(self):
        oi = SimpleNamespace(metadata_json='{"oms_waiting_for_stock": true}', wms_shortage_declared_qty=1.0)
        self.assertEqual(line_shortage_display_kind(oi, 1.0), "waiting")

    def test_without_waiting_flag_shows_shortage(self):
        oi = SimpleNamespace(metadata_json=None, wms_shortage_declared_qty=1.0)
        self.assertEqual(line_shortage_display_kind(oi, 1.0), "shortage")


if __name__ == "__main__":
    unittest.main()
