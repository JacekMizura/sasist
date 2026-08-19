"""Direct sales settings cleanup — legacy workflow status IDs stay in JSON, leave the live schema.

  python -m pytest backend/tests/direct_sales/test_direct_sales_settings_cleanup.py -q
"""

from __future__ import annotations

import unittest

from backend.schemas.direct_sales_settings import DirectSalesSettingsConfig
from backend.services.direct_sales_settings_service import (
    LEGACY_WORKFLOW_STATUS_ID_KEYS,
    preserve_legacy_workflow_status_ids,
)


class TestPreserveLegacyWorkflowStatusIds(unittest.TestCase):
    def test_echoes_existing_keys_into_save_payload(self):
        out = preserve_legacy_workflow_status_ids(
            {"paid_order_status_id": 7, "issued_order_status_id": 8, "enabled": True},
            {"enabled": True, "default_order_status_id": 3},
        )
        self.assertEqual(out["paid_order_status_id"], 7)
        self.assertEqual(out["issued_order_status_id"], 8)
        self.assertEqual(out["default_order_status_id"], 3)
        self.assertNotIn("session_created_order_status_id", out)

    def test_does_not_inject_missing_legacy_keys(self):
        out = preserve_legacy_workflow_status_ids({}, {"enabled": True})
        for key in LEGACY_WORKFLOW_STATUS_ID_KEYS:
            self.assertNotIn(key, out)

    def test_does_not_overwrite_if_payload_already_has_key(self):
        out = preserve_legacy_workflow_status_ids(
            {"paid_order_status_id": 7},
            {"paid_order_status_id": 99},
        )
        self.assertEqual(out["paid_order_status_id"], 99)


class TestLiveConfigDropsWorkflowFields(unittest.TestCase):
    def test_model_ignores_legacy_workflow_ids(self):
        cfg = DirectSalesSettingsConfig.model_validate(
            {
                "enabled": True,
                "paid_order_status_id": 9,
                "session_created_order_status_id": 1,
                "issued_order_status_id": 2,
                "cancelled_order_status_id": 3,
            }
        )
        dumped = cfg.model_dump()
        for key in LEGACY_WORKFLOW_STATUS_ID_KEYS:
            self.assertNotIn(key, dumped)
        self.assertTrue(cfg.enabled)


if __name__ == "__main__":
    unittest.main()
