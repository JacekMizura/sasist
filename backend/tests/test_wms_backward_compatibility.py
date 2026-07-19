"""
WMS / OMS backward compatibility — legacy NULL orders must never disappear from queues.

  python -m pytest backend/tests/test_wms_backward_compatibility.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.operational_features_context import OperationalFeaturesContext
from backend.services.order_operational_mode import resolve_order_operational_mode
from backend.services.wms_picking_product_list_service import _picking_queue_eligibility_clauses
from backend.services.wms_queue_eligibility import (
    order_eligible_for_wms_queues,
    wms_queue_fulfillment_mode_clauses,
)


def _ctx_off() -> OperationalFeaturesContext:
    return OperationalFeaturesContext(
        tenant_id=1,
        warehouse_id=1,
        operational_sales=False,
        immediate_wms_exclusion=False,
        operational_sales_sessions=False,
        operational_runtime=False,
        replenishment_engine=False,
        resolution_scope="test",
    )


def _ctx_on() -> OperationalFeaturesContext:
    return OperationalFeaturesContext(
        tenant_id=1,
        warehouse_id=1,
        operational_sales=True,
        immediate_wms_exclusion=True,
        operational_sales_sessions=True,
        operational_runtime=False,
        replenishment_engine=False,
        resolution_scope="test",
    )


class TestResolveOrderOperationalMode(unittest.TestCase):
    def test_null_defaults_to_online_wms(self):
        order = SimpleNamespace(order_channel=None, fulfillment_mode=None)
        mode = resolve_order_operational_mode(order)
        self.assertEqual(mode.order_channel, "ONLINE")
        self.assertEqual(mode.fulfillment_mode, "WMS")
        self.assertTrue(mode.is_legacy)

    def test_empty_string_defaults(self):
        order = SimpleNamespace(order_channel="", fulfillment_mode="  ")
        mode = resolve_order_operational_mode(order)
        self.assertEqual(mode.order_channel, "ONLINE")
        self.assertEqual(mode.fulfillment_mode, "WMS")
        self.assertTrue(mode.is_legacy)


class TestWmsQueueEligibilityFeatureOff(unittest.TestCase):
    def test_no_sql_clauses_when_feature_off(self):
        self.assertEqual(wms_queue_fulfillment_mode_clauses(features=_ctx_off()), ())

    def test_all_orders_eligible_when_feature_off(self):
        immediate = SimpleNamespace(fulfillment_mode="IMMEDIATE")
        legacy = SimpleNamespace(fulfillment_mode=None)
        self.assertTrue(order_eligible_for_wms_queues(immediate, features=_ctx_off()))
        self.assertTrue(order_eligible_for_wms_queues(legacy, features=_ctx_off()))

    def test_picking_clauses_count_without_exclusion(self):
        clauses = _picking_queue_eligibility_clauses(
            None, tenant_id=1, warehouse_id=1, features=_ctx_off()
        )
        self.assertEqual(len(clauses), 5)


class TestWmsQueueEligibilityFeatureOn(unittest.TestCase):
    def test_legacy_null_eligible(self):
        order = SimpleNamespace(order_channel=None, fulfillment_mode=None)
        self.assertTrue(order_eligible_for_wms_queues(order, features=_ctx_on()))

    def test_immediate_excluded(self):
        order = SimpleNamespace(fulfillment_mode="IMMEDIATE")
        self.assertFalse(order_eligible_for_wms_queues(order, features=_ctx_on()))

    def test_sql_clauses_present(self):
        self.assertEqual(len(wms_queue_fulfillment_mode_clauses(features=_ctx_on())), 1)

    def test_picking_clauses_count_with_exclusion(self):
        clauses = _picking_queue_eligibility_clauses(
            None, tenant_id=1, warehouse_id=1, features=_ctx_on()
        )
        self.assertEqual(len(clauses), 6)


class TestDirectSalesApiGated(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        from fastapi.testclient import TestClient

        from backend.main import app

        cls.client = TestClient(app)

    @patch(
        "backend.api.operational_features_deps.build_operational_features_context",
        return_value=_ctx_off(),
    )
    def test_session_create_404_when_disabled(self, _mock):
        r = self.client.post(
            "/api/direct-sales/session",
            params={"tenant_id": 1, "warehouse_id": 1},
            json={},
        )
        self.assertEqual(r.status_code, 404)


if __name__ == "__main__":
    unittest.main()
