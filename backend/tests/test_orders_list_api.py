"""GET /api/orders — list must not 500 on workflow/serializer edge cases."""

from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.main import app


class OrdersListApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.client = TestClient(app)

    def test_list_default_params_returns_200(self):
        r = self.client.get(
            "/api/orders/",
            params={
                "tenant_id": 1,
                "warehouse_id": 1,
                "limit": 25,
                "offset": 0,
                "sort_by": "order_date",
                "sort_dir": "desc",
            },
        )
        self.assertEqual(r.status_code, 200, r.text[:500])
        self.assertIsInstance(r.json(), list)

    def test_list_survives_workflow_phase_failure(self):
        with patch(
            "backend.services.order_list_service.safe_wms_workflow_phase",
            return_value=None,
        ):
            r = self.client.get(
                "/api/orders/",
                params={"tenant_id": 1, "warehouse_id": 1, "limit": 5},
            )
        self.assertEqual(r.status_code, 200, r.text[:500])

    def test_list_query_failure_returns_503_not_500(self):
        with patch(
            "backend.api.order._collect_order_list_built_rows",
            side_effect=RuntimeError("db query failed"),
        ):
            r = self.client.get(
                "/api/orders/",
                params={"tenant_id": 1, "warehouse_id": 1, "limit": 5},
            )
        self.assertEqual(r.status_code, 503, r.text[:500])
        body = r.json()
        self.assertEqual(body.get("detail", {}).get("code"), "ORDERS_LIST_QUERY_FAILED")
