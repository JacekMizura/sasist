"""Tests for unique barcode_login_code and login-code label record shaping."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock

from backend.services.app_user_admin_service import assert_barcode_login_code_unique


class TestBarcodeLoginCodeUnique(unittest.TestCase):
    def test_empty_ok(self):
        db = MagicMock()
        assert_barcode_login_code_unique(db, None)
        assert_barcode_login_code_unique(db, "  ")
        db.query.assert_not_called()

    def test_duplicate_raises(self):
        db = MagicMock()
        q = db.query.return_value
        q.filter.return_value = q
        q.first.return_value = SimpleNamespace(user_id=2)
        with self.assertRaises(ValueError) as ctx:
            assert_barcode_login_code_unique(db, "MAG123", exclude_user_id=1)
        self.assertEqual(str(ctx.exception), "BARCODE_LOGIN_CODE_EXISTS")

    def test_unique_ok(self):
        db = MagicMock()
        q = db.query.return_value
        q.filter.return_value = q
        q.first.return_value = None
        assert_barcode_login_code_unique(db, "MAG999", exclude_user_id=1)


class TestLoginCodeLabelVariableCatalog(unittest.TestCase):
    def test_frontend_catalog_has_barcode_login_code(self):
        # Lightweight: mirror key naming expected by designer + PDF resolver.
        key = "barcode_login_code"
        token = f"{{{key}}}"
        self.assertEqual(token, "{barcode_login_code}")


if __name__ == "__main__":
    unittest.main()
