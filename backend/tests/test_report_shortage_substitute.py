"""Zgłoszenie braku na linii zamiennika / recovery — walidacja eligibility."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.models.order_item import OMS_LINE_STATUS_REPLACED, OMS_LINE_STATUS_TO_PICK
from backend.services.wms_picking_product_list_service import _line_eligible_for_shortage_report


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


if __name__ == "__main__":
    unittest.main()
