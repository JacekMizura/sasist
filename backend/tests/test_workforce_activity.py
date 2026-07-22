"""Tests for workforce activity session merging and API module resolver."""

import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace

from backend.services.activity_module_resolver import resolve_api_activity, should_track_request
from backend.services.workforce_analytics_service import merge_activity_sessions


def _log(ts: datetime, module: str = "ORDERS", session_id: str | None = None):
    return SimpleNamespace(
        created_at=ts,
        module=module,
        session_id=session_id,
        action_type="view",
    )


class TestMergeActivitySessions(unittest.TestCase):
    def test_single_event_session_minutes(self):
        t0 = datetime(2026, 6, 8, 10, 0, 0)
        sessions = merge_activity_sessions([_log(t0)], gap_minutes=15)
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["events"], 1)
        self.assertEqual(sessions[0]["duration_minutes_approx"], 0.0)

    def test_gap_15_minutes_splits_sessions(self):
        t0 = datetime(2026, 6, 8, 10, 0, 0)
        t1 = t0 + timedelta(minutes=2)
        t2 = t0 + timedelta(minutes=40)
        sessions = merge_activity_sessions([_log(t0), _log(t1), _log(t2)], gap_minutes=15)
        self.assertEqual(len(sessions), 2)
        self.assertEqual(sessions[0]["events"], 2)
        self.assertAlmostEqual(sessions[0]["duration_minutes_approx"], 2.0)
        self.assertEqual(sessions[1]["events"], 1)

    def test_continuous_activity_one_session(self):
        t0 = datetime(2026, 6, 8, 9, 0, 0)
        rows = [_log(t0 + timedelta(minutes=i * 5)) for i in range(4)]
        sessions = merge_activity_sessions(rows, gap_minutes=15)
        self.assertEqual(len(sessions), 1)
        self.assertEqual(sessions[0]["events"], 4)
        self.assertAlmostEqual(sessions[0]["duration_minutes_approx"], 15.0)


class TestActivityModuleResolver(unittest.TestCase):
    def test_post_orders_tracked(self):
        self.assertTrue(should_track_request("POST", "/api/orders/123/status"))
        resolved = resolve_api_activity("POST", "/api/orders/123/status")
        self.assertIsNotNone(resolved)
        module, action = resolved  # type: ignore[misc]
        self.assertEqual(module, "ORDERS")
        self.assertIn("status", action)

    def test_get_requests_skipped(self):
        self.assertFalse(should_track_request("GET", "/api/orders"))
        self.assertIsNone(resolve_api_activity("GET", "/api/orders"))
        self.assertFalse(should_track_request("GET", "/api/wms/dashboard/summary"))
        self.assertIsNone(resolve_api_activity("GET", "/api/wms/dashboard/summary"))

    def test_unmapped_mutation_not_api_module(self):
        """Catch-all technical paths must not become TOP MODUŁY = API."""
        self.assertIsNone(resolve_api_activity("POST", "/api/unknown-thing/xyz"))

    def test_inventory_count_tracked(self):
        resolved = resolve_api_activity("PATCH", "/api/inventory-count/5/lines/10")
        self.assertIsNotNone(resolved)
        module, _ = resolved  # type: ignore[misc]
        self.assertEqual(module, "INVENTORY")

    def test_dedup_wms_receiving_skipped(self):
        self.assertFalse(should_track_request("POST", "/api/wms/receiving/scan"))
        self.assertIsNone(resolve_api_activity("POST", "/api/wms/receiving/scan"))


class TestOperationalActivityFilter(unittest.TestCase):
    def test_excludes_api_and_view_noise(self):
        from backend.services.workforce_analytics_service import filter_operational_activity

        rows = [
            SimpleNamespace(
                module="API",
                action_type="create_x",
                metadata_json='{"method":"POST"}',
            ),
            SimpleNamespace(
                module="WMS_PICKING",
                action_type="view_list",
                metadata_json='{"method":"GET"}',
            ),
            SimpleNamespace(
                module="WMS_PICKING",
                action_type="scan_product",
                metadata_json='{"method":"POST"}',
            ),
            SimpleNamespace(
                module="ORDERS",
                action_type="create_status",
                metadata_json=None,
            ),
        ]
        kept = filter_operational_activity(rows)  # type: ignore[arg-type]
        self.assertEqual(len(kept), 2)
        self.assertEqual({r.module for r in kept}, {"WMS_PICKING", "ORDERS"})


if __name__ == "__main__":
    unittest.main()
