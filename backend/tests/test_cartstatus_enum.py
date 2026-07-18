"""cartstatus PostgreSQL enum alignment unit tests."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, call, patch

from backend.db.cartstatus_enum import (
    CARTSTATUS_REQUIRED_LABELS,
    ensure_cartstatus_enum,
    missing_cartstatus_labels,
)
from backend.models.enums import CartStatus


class TestCartStatusModelLabels(unittest.TestCase):
    def test_lifecycle_values_match_required_labels(self) -> None:
        model_vals = {
            CartStatus.AVAILABLE.value,
            CartStatus.ASSIGNED.value,
            CartStatus.PICKING.value,
            CartStatus.READY_FOR_PACKING.value,
            CartStatus.PACKING.value,
            CartStatus.FULL.value,
            CartStatus.SERVICE.value,
        }
        self.assertEqual(model_vals, set(CARTSTATUS_REQUIRED_LABELS))
        # Alias must not introduce a distinct DB label
        self.assertEqual(CartStatus.IN_PROGRESS.value, "PICKING")


class TestMissingLabels(unittest.TestCase):
    def test_detects_picking_gap(self) -> None:
        # Typical legacy production: PL labels only
        existing = ["pusty", "w trakcie zbierania", "pełny", "w serwisie"]
        missing = missing_cartstatus_labels(existing)
        self.assertIn("PICKING", missing)
        self.assertIn("ASSIGNED", missing)
        self.assertIn("READY_FOR_PACKING", missing)
        self.assertIn("PACKING", missing)
        self.assertIn("AVAILABLE", missing)

    def test_all_present(self) -> None:
        self.assertEqual(missing_cartstatus_labels(CARTSTATUS_REQUIRED_LABELS), [])


class TestEnsureCartstatusEnum(unittest.TestCase):
    def test_noop_on_sqlite(self) -> None:
        engine = MagicMock()
        engine.dialect.name = "sqlite"
        report = ensure_cartstatus_enum(engine)
        self.assertTrue(report["skipped"])
        engine.connect.assert_not_called()

    def test_adds_missing_labels(self) -> None:
        engine = MagicMock()
        engine.dialect.name = "postgresql"

        before = ["AVAILABLE", "IN_PROGRESS", "FULL", "SERVICE"]
        after_labels = list(CARTSTATUS_REQUIRED_LABELS) + ["IN_PROGRESS"]

        conn_ctx = MagicMock()
        conn = MagicMock()
        conn_ctx.__enter__ = MagicMock(return_value=conn)
        conn_ctx.__exit__ = MagicMock(return_value=False)
        engine.connect.return_value = conn_ctx
        engine.begin.return_value = conn_ctx

        # carts_status_udt_name path + pg_enum_labels
        def execute_side_effect(stmt, params=None):
            sql = str(stmt)
            result = MagicMock()
            if "information_schema.columns" in sql:
                result.fetchone.return_value = ("cartstatus", "USER-DEFINED")
            elif "typtype = 'e'" in sql or "typtype" in sql:
                result.fetchone.return_value = (1,)
            elif "pg_enum" in sql:
                # Return before on first calls, after once adds happen — simplify: always after
                # First two label reads use before, later after
                if not getattr(execute_side_effect, "n", 0):
                    execute_side_effect.n = 0  # type: ignore[attr-defined]
                execute_side_effect.n += 1  # type: ignore[attr-defined]
                labels = before if execute_side_effect.n <= 2 else after_labels  # type: ignore[attr-defined]
                result.fetchall.return_value = [(x,) for x in labels]
            elif "UPDATE carts" in sql:
                result.rowcount = 0
            else:
                result.fetchone.return_value = None
                result.fetchall.return_value = []
                result.rowcount = 0
            return result

        conn.execute.side_effect = execute_side_effect

        with patch("backend.db.cartstatus_enum._add_enum_label", return_value=True) as add:
            report = ensure_cartstatus_enum(engine)

        self.assertEqual(report["enum_name"], "cartstatus")
        self.assertEqual(report["before"], before)
        # Must attempt ADD for lifecycle gaps
        added_calls = [c.args[2] for c in add.call_args_list]
        for need in ("ASSIGNED", "PICKING", "READY_FOR_PACKING", "PACKING"):
            self.assertIn(need, added_calls)


if __name__ == "__main__":
    unittest.main()
