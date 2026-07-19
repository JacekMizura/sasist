"""
Eligibility snapshot matrix — regression guard for queue filters.

  python -m pytest backend/tests/test_wms_eligibility_snapshots.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace

from backend.services.operational_features_context import OperationalFeaturesContext
from backend.services.wms_picking_product_list_service import _picking_queue_eligibility_clauses
from backend.services.wms_queue_eligibility import (
    order_eligible_for_wms_queues,
    wms_queue_fulfillment_mode_clauses,
)

ORDER_FIXTURES: tuple[tuple[str, object | None, object | None], ...] = (
    ("legacy_null", None, None),
    ("legacy_empty", "", "  "),
    ("explicit_wms", "ONLINE", "WMS"),
    ("immediate", "DIRECT_SALE", "IMMEDIATE"),
    ("pickup", "ONLINE", "PICKUP"),
    ("delivery", "ONLINE", "DELIVERY"),
    ("reservation", "ONLINE", "RESERVATION"),
    ("malformed_mode", "ONLINE", "NOT_A_REAL_MODE"),
    ("garbage_channel", "???", None),
)


def _ctx(*, exclusion: bool, ops: bool = True) -> OperationalFeaturesContext:
    return OperationalFeaturesContext(
        tenant_id=1,
        warehouse_id=1,
        operational_sales=ops,
        immediate_wms_exclusion=exclusion,
        operational_sales_sessions=ops,
        operational_runtime=False,
        replenishment_engine=False,
        resolution_scope="test",
    )


def _snapshot(features: OperationalFeaturesContext) -> dict[str, dict[str, object]]:
    out: dict[str, dict[str, object]] = {}
    for name, ch, fm in ORDER_FIXTURES:
        order = SimpleNamespace(
            id=100,
            tenant_id=1,
            warehouse_id=1,
            order_channel=ch,
            fulfillment_mode=fm,
        )
        picking_clauses = _picking_queue_eligibility_clauses(
            None, tenant_id=1, warehouse_id=1, features=features
        )
        mode_clauses = wms_queue_fulfillment_mode_clauses(features=features, queue_name="picking")
        out[name] = {
            "eligible": order_eligible_for_wms_queues(
                order, features=features, queue_name="picking"
            ),
            "mode_clause_count": len(mode_clauses),
            "picking_clause_count": len(picking_clauses),
            # shortages/recovery/waves do not apply fulfillment_mode filters today
            "shortages_filtered": False,
            "recovery_filtered": False,
        }
    return out


# Frozen snapshots — update only when eligibility semantics intentionally change.
# picking_clause_count = finished_at + deleted_at + fulfillment_open + [mode?] + consolidation×2
SNAPSHOT_EXCLUSION_OFF: dict[str, dict[str, object]] = {
    "legacy_null": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "legacy_empty": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "explicit_wms": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "immediate": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "pickup": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "delivery": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "reservation": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "malformed_mode": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
    "garbage_channel": {"eligible": True, "mode_clause_count": 0, "picking_clause_count": 5, "shortages_filtered": False, "recovery_filtered": False},
}

SNAPSHOT_EXCLUSION_ON: dict[str, dict[str, object]] = {
    "legacy_null": {"eligible": True, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "legacy_empty": {"eligible": True, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "explicit_wms": {"eligible": True, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "immediate": {"eligible": False, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "pickup": {"eligible": False, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "delivery": {"eligible": False, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "reservation": {"eligible": False, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "malformed_mode": {"eligible": False, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
    "garbage_channel": {"eligible": True, "mode_clause_count": 1, "picking_clause_count": 6, "shortages_filtered": False, "recovery_filtered": False},
}


class TestEligibilitySnapshots(unittest.TestCase):
    def test_snapshot_exclusion_off(self):
        snap = _snapshot(_ctx(exclusion=False))
        self.assertEqual(snap, SNAPSHOT_EXCLUSION_OFF)

    def test_snapshot_exclusion_on(self):
        snap = _snapshot(_ctx(exclusion=True))
        self.assertEqual(snap, SNAPSHOT_EXCLUSION_ON)

    def test_exclusion_requires_operational_sales_master(self):
        snap = _snapshot(_ctx(exclusion=True, ops=False))
        for row in snap.values():
            self.assertTrue(row["eligible"])
            self.assertEqual(row["mode_clause_count"], 0)


class TestScopedFeatures(unittest.TestCase):
    def test_warehouse_override_wins(self):
        from backend.services.operational_features_context import _tri_merge

        val, scope = _tri_merge(False, True, False)
        self.assertFalse(val)
        self.assertEqual(scope, "warehouse")

    def test_tenant_override_when_no_warehouse(self):
        from backend.services.operational_features_context import _tri_merge

        val, scope = _tri_merge(False, True, None)
        self.assertTrue(val)
        self.assertEqual(scope, "tenant")


if __name__ == "__main__":
    unittest.main()
