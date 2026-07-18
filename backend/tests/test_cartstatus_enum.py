"""cartstatus PostgreSQL enum — clean rebuild (variant B) unit tests."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock

from backend.db.cartstatus_enum import (
    CARTSTATUS_CANONICAL,
    CARTSTATUS_LEGACY_TO_CANONICAL,
    ensure_cartstatus_enum,
    migrate_cartstatus_enum_clean,
)
from backend.models.enums import CartStatus, normalize_cart_status_value


class TestCartStatusModelLabels(unittest.TestCase):
    def test_exactly_five_lifecycle_members(self) -> None:
        model_vals = {st.value for st in CartStatus}
        self.assertEqual(model_vals, set(CARTSTATUS_CANONICAL))
        self.assertEqual(len(CartStatus), 5)

    def test_no_legacy_members(self) -> None:
        names = {st.name for st in CartStatus}
        for banned in ("FULL", "SERVICE", "IN_PROGRESS"):
            self.assertNotIn(banned, names)


class TestNormalizeCartStatus(unittest.TestCase):
    def test_canonical_passthrough(self) -> None:
        for lab in CARTSTATUS_CANONICAL:
            self.assertEqual(normalize_cart_status_value(lab), lab)

    def test_legacy_migration_map_only(self) -> None:
        self.assertEqual(normalize_cart_status_value("IN_PROGRESS"), "PICKING")
        self.assertEqual(normalize_cart_status_value("FULL"), "AVAILABLE")
        self.assertEqual(normalize_cart_status_value("SERVICE"), "AVAILABLE")
        self.assertEqual(normalize_cart_status_value("pełny"), "AVAILABLE")
        self.assertEqual(normalize_cart_status_value("w serwisie"), "AVAILABLE")
        self.assertEqual(normalize_cart_status_value("pusty"), "AVAILABLE")
        self.assertEqual(normalize_cart_status_value("w trakcie zbierania"), "PICKING")

    def test_legacy_keys_are_not_canonical_members(self) -> None:
        legacy_only = {
            k
            for k, v in CARTSTATUS_LEGACY_TO_CANONICAL.items()
            if k != v and k not in CARTSTATUS_CANONICAL
        }
        self.assertTrue({"IN_PROGRESS", "FULL", "SERVICE"} <= legacy_only)


class TestMigrateCartstatusEnum(unittest.TestCase):
    def test_sqlite_remaps_legacy_strings(self) -> None:
        engine = MagicMock()
        engine.dialect.name = "sqlite"
        conn_ctx = MagicMock()
        conn = MagicMock()
        conn_ctx.__enter__ = MagicMock(return_value=conn)
        conn_ctx.__exit__ = MagicMock(return_value=False)
        engine.begin.return_value = conn_ctx

        report = migrate_cartstatus_enum_clean(engine)
        self.assertEqual(report["action"], "sqlite_string_remap")
        self.assertFalse(report.get("skipped"))
        # At least one UPDATE for a legacy≠canonical pair
        self.assertTrue(conn.execute.called)

    def test_postgres_already_clean_skips(self) -> None:
        engine = MagicMock()
        engine.dialect.name = "postgresql"

        conn_ctx = MagicMock()
        conn = MagicMock()
        conn_ctx.__enter__ = MagicMock(return_value=conn)
        conn_ctx.__exit__ = MagicMock(return_value=False)
        engine.connect.return_value = conn_ctx

        def execute_side_effect(stmt, params=None):
            sql = str(stmt)
            result = MagicMock()
            if "information_schema.tables" in sql:
                result.fetchone.return_value = (1,)
            elif "information_schema.columns" in sql:
                result.fetchone.return_value = ("USER-DEFINED", "cartstatus")
            elif "typtype = 'e'" in sql:
                result.fetchone.return_value = (1,)
            elif "pg_enum" in sql:
                result.fetchall.return_value = [(x,) for x in CARTSTATUS_CANONICAL]
            else:
                result.fetchone.return_value = None
                result.fetchall.return_value = []
            return result

        conn.execute.side_effect = execute_side_effect

        report = ensure_cartstatus_enum(engine)
        self.assertTrue(report["skipped"])
        self.assertEqual(report["action"], "already_clean")
        self.assertEqual(set(report["after"]), set(CARTSTATUS_CANONICAL))
        engine.begin.assert_not_called()


if __name__ == "__main__":
    unittest.main()
