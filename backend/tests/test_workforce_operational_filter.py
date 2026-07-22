"""Unit tests for operational activity filtering (no technical API in workforce KPIs)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.workforce_analytics_service import (
    filter_operational_activity,
    is_operational_activity_row,
)


class TestOperationalFilter(unittest.TestCase):
    def test_api_module_excluded(self):
        row = SimpleNamespace(module="API", action_type="create_x", metadata_json=None)
        self.assertFalse(is_operational_activity_row(row))  # type: ignore[arg-type]

    def test_get_middleware_excluded(self):
        row = SimpleNamespace(
            module="ORDERS",
            action_type="view_list",
            metadata_json='{"source":"api_middleware","method":"GET"}',
        )
        self.assertFalse(is_operational_activity_row(row))  # type: ignore[arg-type]

    def test_wms_pick_kept(self):
        row = SimpleNamespace(module="WMS_PICKING", action_type="scan_product", metadata_json=None)
        self.assertTrue(is_operational_activity_row(row))  # type: ignore[arg-type]

    def test_filter_batch(self):
        rows = [
            SimpleNamespace(module="API", action_type="x", metadata_json=None),
            SimpleNamespace(module="WMS_PACKING", action_type="pack_confirm", metadata_json=None),
            SimpleNamespace(module="SYSTEM", action_type="tick", metadata_json=None),
        ]
        out = filter_operational_activity(rows)  # type: ignore[arg-type]
        self.assertEqual([r.module for r in out], ["WMS_PACKING"])


if __name__ == "__main__":
    unittest.main()
