"""Z-PZ return receipt helpers."""

from __future__ import annotations

import json
import unittest

from backend.services.rmz_return_receipt_service import (
    _parse_damage_entries_json,
    _planned_stock_counts_for_line,
)
from backend.services.returns.z_pz_constants import RETURN_RECEIPT_DOCUMENT_TYPES, Z_PZ


class TestZPzConstants(unittest.TestCase):
    def test_z_pz_in_return_receipt_types(self) -> None:
        self.assertIn(Z_PZ, RETURN_RECEIPT_DOCUMENT_TYPES)


class TestZPzPlannedCounts(unittest.TestCase):
    def test_rejected_excluded_by_default(self) -> None:
        class _Ln:
            accepted_qty = 0
            rejected_qty = 2
            damaged_b_qty = 0
            damaged_c_qty = 0
            damage_type = "reject:product_used"
            decision = "REJECTED"
            damage_entries_json = None
            id = 1

        aq, dmg, rej = _planned_stock_counts_for_line(None, 1, 1, _Ln(), include_rejected=False)  # type: ignore[arg-type]
        self.assertEqual(aq, 0)
        self.assertEqual(dmg, [])
        self.assertEqual(rej, 0)


class TestSourceRmzJson(unittest.TestCase):
    def test_parse_ids(self) -> None:
        from backend.services.rmz_return_receipt_service import _parse_source_rmz_ids

        self.assertEqual(_parse_source_rmz_ids(json.dumps([1, 2, 2])), [1, 2])
        self.assertEqual(_parse_source_rmz_ids(None), [])


if __name__ == "__main__":
    unittest.main()
