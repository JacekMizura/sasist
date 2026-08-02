"""Unit tests for WMS floor modes vs legacy module-mode → permission migration."""

from __future__ import annotations

import unittest

from backend.services.app_user_admin_service import _modes_for_client_gating
from backend.wms_operational_modes import (
    LEGACY_WMS_MODULE_MODE_TO_PERMISSION,
    WMS_OPERATIONAL_MODES,
    is_legacy_wms_module_mode,
    is_valid_wms_mode,
    split_wms_modes_and_legacy_permissions,
)


class WmsOperationalModesCatalogTests(unittest.TestCase):
    def test_floor_catalog_excludes_system_modules(self) -> None:
        keys = {k for k, _ in WMS_OPERATIONAL_MODES}
        for banned in ("operations", "carts", "qc", "documents", "analytics", "purchasing", "labels"):
            self.assertNotIn(banned, keys)
            self.assertFalse(is_valid_wms_mode(banned))
            self.assertTrue(is_legacy_wms_module_mode(banned))

    def test_split_migrates_legacy_keys(self) -> None:
        floor, perms = split_wms_modes_and_legacy_permissions(
            ["picking", "operations", "labels", "unknown", "packing", "operations"]
        )
        self.assertEqual(floor, ["picking", "packing"])
        self.assertEqual(
            perms,
            [
                LEGACY_WMS_MODULE_MODE_TO_PERMISSION["operations"],
                LEGACY_WMS_MODULE_MODE_TO_PERMISSION["labels"],
            ],
        )

    def test_client_gating_keeps_legacy_only_lists(self) -> None:
        """Legacy-only profiles must not become [] (all floors)."""
        raw = ["operations", "carts"]
        floor, _ = split_wms_modes_and_legacy_permissions(raw)
        self.assertEqual(floor, [])
        self.assertEqual(_modes_for_client_gating(raw, floor), ["operations", "carts"])

    def test_client_gating_prefers_floor_when_present(self) -> None:
        raw = ["picking", "operations"]
        floor, _ = split_wms_modes_and_legacy_permissions(raw)
        self.assertEqual(_modes_for_client_gating(raw, floor), ["picking"])


if __name__ == "__main__":
    unittest.main()
