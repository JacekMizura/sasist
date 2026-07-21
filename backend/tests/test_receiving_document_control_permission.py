"""RBAC: warehouse.receipts.control for blind-receiving control view."""

from __future__ import annotations

import unittest

from backend.auth.permission_catalog import PERMISSION_KEYS, ROLE_PERMISSION_PRESETS


class ReceivingDocumentControlPermissionTests(unittest.TestCase):
    def test_permission_in_catalog(self) -> None:
        self.assertIn("warehouse.receipts.control", PERMISSION_KEYS)

    def test_warehouse_manager_has_control(self) -> None:
        self.assertIn("warehouse.receipts.control", ROLE_PERMISSION_PRESETS["warehouse_manager"])

    def test_purchasing_receive_without_control_is_blind_capable(self) -> None:
        """Purchasing can receive but need not see expected qty during floor count."""
        preset = ROLE_PERMISSION_PRESETS["purchasing"]
        self.assertIn("warehouse.receipts", preset)
        self.assertNotIn("warehouse.receipts.control", preset)


if __name__ == "__main__":
    unittest.main()
