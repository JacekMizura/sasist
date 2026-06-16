"""PostgreSQL sequence sync — unit tests (logic + SQLite no-op)."""

from __future__ import annotations

import unittest

from sqlalchemy import create_engine

from backend.db.postgres_sequence_sync import (
    ensure_postgres_sequences_synced,
    next_sequence_value,
    sequence_needs_fix,
)


class TestSequenceSyncLogic(unittest.TestCase):
    def test_next_value_when_called(self) -> None:
        self.assertEqual(next_sequence_value(12, is_called=True), 13)

    def test_next_value_when_not_called(self) -> None:
        self.assertEqual(next_sequence_value(12, is_called=False), 12)

    def test_needs_fix_when_sequence_lags_max(self) -> None:
        self.assertTrue(sequence_needs_fix(353, 12, is_called=False))
        self.assertTrue(sequence_needs_fix(353, 12, is_called=True))

    def test_ok_when_sequence_ahead(self) -> None:
        self.assertFalse(sequence_needs_fix(353, 353, is_called=True))
        self.assertFalse(sequence_needs_fix(353, 354, is_called=False))

    def test_empty_table_expects_next_one(self) -> None:
        self.assertFalse(sequence_needs_fix(0, 1, is_called=False))
        self.assertTrue(sequence_needs_fix(0, 5, is_called=False))


class TestSequenceSyncSQLiteNoop(unittest.TestCase):
    def test_noop_on_sqlite(self) -> None:
        engine = create_engine("sqlite:///:memory:")
        report = ensure_postgres_sequences_synced(engine)
        self.assertEqual(report.dialect, "sqlite")
        self.assertEqual(report.checked, 0)
        self.assertEqual(report.fixed, 0)


if __name__ == "__main__":
    unittest.main()
