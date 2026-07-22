"""Legacy transfer default migration for direct sales settings.

  python -m pytest backend/tests/direct_sales/test_direct_sales_settings_transfer.py -q
"""

from __future__ import annotations

import unittest

from backend.services.direct_sales_settings_service import (
    _DS_PAYMENT_METHODS_V2_KEY,
    _migrate_payment_methods_defaults,
)


class TestTransferDefaultMigration(unittest.TestCase):
    def test_legacy_false_becomes_true(self):
        out = _migrate_payment_methods_defaults(
            {"payment_methods": {"cash": True, "card": True, "blik": True, "transfer": False, "mixed": False}}
        )
        self.assertTrue(out["payment_methods"]["transfer"])

    def test_v2_flag_preserves_intentional_false(self):
        out = _migrate_payment_methods_defaults(
            {
                "payment_methods": {
                    "cash": True,
                    "card": True,
                    "blik": True,
                    "transfer": False,
                    "mixed": False,
                },
                "extensions": {_DS_PAYMENT_METHODS_V2_KEY: True},
            }
        )
        self.assertFalse(out["payment_methods"]["transfer"])

    def test_true_unchanged(self):
        out = _migrate_payment_methods_defaults(
            {"payment_methods": {"cash": True, "card": True, "blik": True, "transfer": True, "mixed": False}}
        )
        self.assertTrue(out["payment_methods"]["transfer"])


if __name__ == "__main__":
    unittest.main()
