"""
Phase 1 operational sales — WMS exclusion, location-stock, catalog, events.

  python -m pytest backend/tests/test_operational_sales_phase1.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.main import app
from backend.services.document_series_catalog import (
    ALL_OPERATIONAL_SERIES,
    OPERATIONAL_WAREHOUSE_SERIES,
    REQUIRED_BOOTSTRAP_COUNT,
    normalize_series_spec,
)
from backend.services.location_priority_service import suggest_sales_locations
from backend.services.operational_sales_events import build_event_payload, EVENT_VERSION
from backend.services.wms_queue_eligibility import (
    order_eligible_for_wms_queues,
    wms_queue_fulfillment_mode_clauses,
)


class TestWmsQueueEligibility(unittest.TestCase):
    def test_immediate_order_not_wms_eligible(self):
        order = SimpleNamespace(fulfillment_mode="IMMEDIATE")
        self.assertFalse(order_eligible_for_wms_queues(order))

    def test_wms_order_eligible(self):
        order = SimpleNamespace(fulfillment_mode="WMS")
        self.assertTrue(order_eligible_for_wms_queues(order))

    def test_null_mode_defaults_eligible(self):
        order = SimpleNamespace(fulfillment_mode=None)
        self.assertTrue(order_eligible_for_wms_queues(order))

    def test_fulfillment_mode_clauses_tuple(self):
        clauses = wms_queue_fulfillment_mode_clauses()
        self.assertEqual(len(clauses), 1)


class TestLocationPriority(unittest.TestCase):
    def test_sales_prefers_sales_zone_over_showroom(self):
        rows = [
            {
                "location_id": 2,
                "operational_zone_type": "SHOWROOM",
                "sales_priority": 10,
                "available": 5.0,
                "code": "SR-1",
            },
            {
                "location_id": 1,
                "operational_zone_type": "SALES",
                "sales_priority": 50,
                "available": 5.0,
                "code": "S-1",
            },
        ]
        out = suggest_sales_locations(rows, quantity=1.0)
        self.assertEqual(out[0]["location_id"], 1)


class TestDocumentSeriesCatalog(unittest.TestCase):
    def test_zw_zd_in_operational_warehouse_bootstrap(self):
        subtypes = {normalize_series_spec(s)["subtype"] for s in OPERATIONAL_WAREHOUSE_SERIES}
        self.assertIn("ZW", subtypes)
        self.assertIn("ZD", subtypes)

    def test_required_bootstrap_count_includes_zw_zd(self):
        self.assertEqual(REQUIRED_BOOTSTRAP_COUNT, len(ALL_OPERATIONAL_SERIES))
        self.assertGreaterEqual(REQUIRED_BOOTSTRAP_COUNT, 10)


class TestOperationalSalesEvents(unittest.TestCase):
    def test_event_payload_versioned_with_context(self):
        payload = build_event_payload(
            "stock.issued",
            tenant_id=1,
            warehouse_id=1,
            order_id=15,
            location_id=22,
            product_id=5,
            qty=2,
            source="direct_sales",
        )
        self.assertEqual(payload["event"], "stock.issued")
        self.assertEqual(payload["version"], EVENT_VERSION)
        self.assertEqual(payload["tenant_id"], 1)
        self.assertEqual(payload["warehouse_id"], 1)
        self.assertEqual(payload["order_id"], 15)
        self.assertEqual(payload["location_id"], 22)
        self.assertEqual(payload["product_id"], 5)
        self.assertEqual(payload["qty"], 2.0)
        self.assertIn("occurred_at", payload)


class TestLocationStockApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_location_stock_unknown_product_404(self):
        with patch(
            "backend.api.location_stock.resolve_product_id",
            return_value=None,
        ):
            r = self.client.get(
                "/api/location-stock",
                params={"tenant_id": 1, "warehouse_id": 1, "product_id": 99999},
            )
        self.assertEqual(r.status_code, 404)

    @patch("backend.api.location_stock.build_location_stock")
    @patch("backend.api.location_stock.resolve_product_id")
    def test_location_stock_returns_projection(self, mock_resolve, mock_build):
        mock_resolve.return_value = 5
        mock_build.return_value = {
            "product_id": 5,
            "warehouse_id": 1,
            "summary": {"available": 3.0, "reserved": 1.0, "picking": 0.0},
            "locations": [
                {
                    "location_id": 10,
                    "code": "A1",
                    "type": "NORMAL",
                    "operational_zone_type": "SALES",
                    "available": 3.0,
                    "on_hand": 4.0,
                    "reserved": 1.0,
                    "picking": 0.0,
                    "sales_priority": 10,
                    "picking_priority": 100,
                }
            ],
        }
        r = self.client.get(
            "/api/location-stock",
            params={"tenant_id": 1, "warehouse_id": 1, "product_id": 5},
        )
        self.assertEqual(r.status_code, 200)
        body = r.json()
        self.assertEqual(body["product_id"], 5)
        self.assertEqual(body["summary"]["available"], 3.0)
        self.assertEqual(len(body["locations"]), 1)


class TestPackingQueueWmsFilter(unittest.TestCase):
    def test_packing_queue_includes_fulfillment_filter(self):
        from backend.services.wms_packing_service import _packing_orders_base_query

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        with patch(
            "backend.services.wms_packing_service._packing_queue_status_ids",
            return_value=[3],
        ):
            _packing_orders_base_query(
                db, tenant_id=1, warehouse_id=1, status_id=3, mode="no_cart", cart_id=None
            )
        filter_args = q.filter.call_args[0]
        self.assertGreaterEqual(len(filter_args), 4)


if __name__ == "__main__":
    unittest.main()
