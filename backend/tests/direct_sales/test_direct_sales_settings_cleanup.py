"""Direct sales settings cleanup — legacy workflow status IDs stay in JSON, leave the live schema.

  python -m pytest backend/tests/direct_sales/test_direct_sales_settings_cleanup.py -q
"""

from __future__ import annotations

import json
import unittest
from unittest.mock import MagicMock, patch

from backend.models.direct_sales_settings import DirectSalesSettings
from backend.schemas.direct_sales_settings import DirectSalesSettingsConfig
from backend.services.direct_sales_settings_service import (
    LEGACY_CUSTOMER_SETTING_KEYS,
    LEGACY_TERMINAL_SETTING_KEYS,
    LEGACY_WORKFLOW_STATUS_ID_KEYS,
    preserve_legacy_customer_setting_keys,
    preserve_legacy_terminal_setting_keys,
    preserve_legacy_workflow_status_ids,
    resolve_direct_sales_settings,
    save_direct_sales_settings,
    _config_from_dict,
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


class TestPreserveLegacyCustomerSettingKeys(unittest.TestCase):
    def test_echoes_existing_customer_keys_into_save_payload(self):
        existing = {
            "allow_anonymous": False,
            "require_customer_for_invoice": True,
            "auto_save_customers": False,
            "quick_create_customer": True,
            "enabled": True,
        }
        out = preserve_legacy_customer_setting_keys(existing, {"enabled": True})
        for key in LEGACY_CUSTOMER_SETTING_KEYS:
            self.assertEqual(out[key], existing[key])

    def test_does_not_inject_missing_legacy_keys(self):
        out = preserve_legacy_customer_setting_keys({}, {"enabled": True})
        for key in LEGACY_CUSTOMER_SETTING_KEYS:
            self.assertNotIn(key, out)


class TestLiveConfigDropsCustomerFields(unittest.TestCase):
    def test_model_ignores_legacy_customer_keys(self):
        cfg = DirectSalesSettingsConfig.model_validate(
            {
                "enabled": True,
                "allow_anonymous": False,
                "require_customer_for_invoice": False,
                "auto_save_customers": False,
                "quick_create_customer": False,
            }
        )
        dumped = cfg.model_dump()
        for key in LEGACY_CUSTOMER_SETTING_KEYS:
            self.assertNotIn(key, dumped)

    def test_config_from_dict_strips_legacy_customer_keys(self):
        cfg = _config_from_dict(
            {
                "enabled": True,
                "allow_anonymous": False,
                "quick_create_customer": True,
            }
        )
        dumped = cfg.model_dump()
        for key in LEGACY_CUSTOMER_SETTING_KEYS:
            self.assertNotIn(key, dumped)

    def test_legacy_customer_save_round_trip_preserves_json(self):
        row = DirectSalesSettings(
            tenant_id=1,
            warehouse_id=0,
            settings_json=json.dumps(
                {
                    "enabled": True,
                    "allow_anonymous": False,
                    "require_customer_for_invoice": True,
                    "auto_save_customers": False,
                    "quick_create_customer": True,
                }
            ),
        )
        db = MagicMock()
        with patch(
            "backend.services.direct_sales_settings_service._get_or_create_row",
            return_value=row,
        ), patch(
            "backend.services.direct_sales_settings_service._get_row",
            return_value=row,
        ):
            save_direct_sales_settings(
                db,
                tenant_id=1,
                warehouse_id=0,
                settings=DirectSalesSettingsConfig(enabled=True),
            )
        saved = json.loads(row.settings_json)
        for key in LEGACY_CUSTOMER_SETTING_KEYS:
            self.assertIn(key, saved)
        self.assertNotIn("allow_anonymous", DirectSalesSettingsConfig.model_validate(saved).model_dump())


class TestPreserveLegacyTerminalSettingKeys(unittest.TestCase):
    def test_echoes_existing_terminal_keys_into_save_payload(self):
        existing = {
            "scanner_mode": True,
            "auto_focus_scan": False,
            "terminal_sounds": True,
            "zebra_tablet_mode": False,
            "enabled": True,
        }
        out = preserve_legacy_terminal_setting_keys(existing, {"enabled": True, "keyboard_shortcuts": False})
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertEqual(out[key], existing[key])
        self.assertFalse(out["keyboard_shortcuts"])

    def test_does_not_inject_missing_legacy_keys(self):
        out = preserve_legacy_terminal_setting_keys({}, {"enabled": True})
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertNotIn(key, out)


class TestLiveConfigDropsTerminalFields(unittest.TestCase):
    def test_model_ignores_legacy_terminal_keys(self):
        cfg = DirectSalesSettingsConfig.model_validate(
            {
                "enabled": True,
                "scanner_mode": True,
                "auto_focus_scan": False,
                "terminal_sounds": True,
                "zebra_tablet_mode": True,
            }
        )
        dumped = cfg.model_dump()
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertNotIn(key, dumped)

    def test_config_from_dict_strips_legacy_terminal_keys(self):
        cfg = _config_from_dict(
            {
                "enabled": True,
                "scanner_mode": True,
                "auto_focus_scan": False,
                "terminal_sounds": True,
                "zebra_tablet_mode": True,
            }
        )
        dumped = cfg.model_dump()
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertNotIn(key, dumped)

    def test_legacy_terminal_save_round_trip_preserves_json(self):
        row = DirectSalesSettings(
            tenant_id=1,
            warehouse_id=0,
            settings_json=json.dumps(
                {
                    "enabled": True,
                    "scanner_mode": True,
                    "auto_focus_scan": False,
                    "terminal_sounds": True,
                    "zebra_tablet_mode": False,
                }
            ),
        )
        db = MagicMock()
        with patch(
            "backend.services.direct_sales_settings_service._get_or_create_row",
            return_value=row,
        ), patch(
            "backend.services.direct_sales_settings_service._get_row",
            return_value=row,
        ):
            save_direct_sales_settings(
                db,
                tenant_id=1,
                warehouse_id=0,
                settings=DirectSalesSettingsConfig(enabled=True, keyboard_shortcuts=False),
            )
        saved = json.loads(row.settings_json)
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertIn(key, saved)
        self.assertFalse(saved["keyboard_shortcuts"])
        live = DirectSalesSettingsConfig.model_validate(saved).model_dump()
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertNotIn(key, live)


class TestKeyboardShortcutsWarehouseMerge(unittest.TestCase):
    def _resolve(self, *, tenant_json: dict, wh_json: dict | None, warehouse_id: int = 1):
        tenant_row = DirectSalesSettings(
            tenant_id=1,
            warehouse_id=0,
            settings_json=json.dumps(tenant_json),
        )
        wh_row = (
            DirectSalesSettings(
                tenant_id=1,
                warehouse_id=warehouse_id,
                settings_json=json.dumps(wh_json),
            )
            if wh_json is not None
            else None
        )
        db = MagicMock()

        def _get_row(_db, tid, wid):
            if int(wid) == 0:
                return tenant_row
            if wh_row is not None and int(wid) == warehouse_id:
                return wh_row
            return None

        with patch(
            "backend.services.direct_sales_settings_service._get_row",
            side_effect=_get_row,
        ):
            return resolve_direct_sales_settings(db, tenant_id=1, warehouse_id=warehouse_id)

    def test_tenant_true_no_wh_override(self):
        read = self._resolve(tenant_json={"keyboard_shortcuts": True}, wh_json=None)
        self.assertTrue(read.resolved.keyboard_shortcuts)

    def test_tenant_true_wh_false(self):
        read = self._resolve(
            tenant_json={"keyboard_shortcuts": True},
            wh_json={"keyboard_shortcuts": False},
        )
        self.assertFalse(read.resolved.keyboard_shortcuts)

    def test_tenant_false_wh_true(self):
        read = self._resolve(
            tenant_json={"keyboard_shortcuts": False},
            wh_json={"keyboard_shortcuts": True},
        )
        self.assertTrue(read.resolved.keyboard_shortcuts)

    def test_get_does_not_expose_legacy_terminal_keys(self):
        read = self._resolve(
            tenant_json={
                "keyboard_shortcuts": True,
                "scanner_mode": True,
                "auto_focus_scan": False,
                "terminal_sounds": True,
                "zebra_tablet_mode": True,
            },
            wh_json=None,
        )
        dumped = read.resolved.model_dump()
        for key in LEGACY_TERMINAL_SETTING_KEYS:
            self.assertNotIn(key, dumped)


if __name__ == "__main__":
    unittest.main()
