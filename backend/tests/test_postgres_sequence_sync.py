"""PostgreSQL sequence sync — unit tests (logic + SQLite no-op)."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from sqlalchemy import Column, Integer, MetaData, Table, create_engine

from backend.db.postgres_sequence_sync import (
    SequenceSyncResult,
    ensure_postgres_sequences_synced,
    next_sequence_value,
    sequence_needs_fix,
)


def _make_result(table: str, *, action: str = "ok") -> SequenceSyncResult:
    return SequenceSyncResult(
        table=table,
        column="id",
        sequence=f"public.{table}_id_seq",
        max_id=1,
        last_value=1,
        is_called=True,
        next_value=2,
        action=action,
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


class TestSequenceSyncPerTableTransactions(unittest.TestCase):
    def setUp(self) -> None:
        self.metadata = MetaData()
        for name in ("good_table", "broken_table", "no_sequence_table"):
            Table(name, self.metadata, Column("id", Integer, primary_key=True))
        self.engine = MagicMock()
        self.engine.dialect.name = "postgresql"
        self.conn = MagicMock()
        self.engine.begin.return_value.__enter__ = MagicMock(return_value=self.conn)
        self.engine.begin.return_value.__exit__ = MagicMock(return_value=False)

    @patch("backend.db.postgres_sequence_sync._sync_table_sequence")
    def test_one_table_missing_sequence_does_not_block_others(self, mock_sync) -> None:
        def side_effect(_conn, table: Table) -> SequenceSyncResult:
            label = table.name
            if label == "no_sequence_table":
                return _make_result(label, action="skipped_no_sequence")
            return _make_result(label, action="fixed")

        mock_sync.side_effect = side_effect

        report = ensure_postgres_sequences_synced(
            self.engine,
            metadata=self.metadata,
            table_names=["good_table", "no_sequence_table"],
        )

        self.assertEqual(mock_sync.call_count, 2)
        self.assertEqual(self.engine.begin.call_count, 2)
        self.assertEqual(report.skipped, 1)
        self.assertEqual(report.fixed, 1)
        self.assertEqual(report.errors, 0)
        self.assertEqual({r.table: r.action for r in report.results}, {
            "good_table": "fixed",
            "no_sequence_table": "skipped_no_sequence",
        })

    @patch("backend.db.postgres_sequence_sync._sync_table_sequence")
    def test_one_table_exception_does_not_poison_subsequent_tables(self, mock_sync) -> None:
        def side_effect(_conn, table: Table) -> SequenceSyncResult:
            label = table.name
            if label == "no_sequence_table":
                return _make_result(label, action="skipped_no_sequence")
            if label == "broken_table":
                raise RuntimeError("setval failed")
            return _make_result(label, action="fixed")

        mock_sync.side_effect = side_effect

        with self.assertLogs("backend.db.postgres_sequence_sync", level="INFO") as logs:
            report = ensure_postgres_sequences_synced(
                self.engine,
                metadata=self.metadata,
                table_names=["no_sequence_table", "broken_table", "good_table"],
            )

        self.assertEqual(mock_sync.call_count, 3)
        self.assertEqual(self.engine.begin.call_count, 3)
        self.assertEqual(report.skipped, 1)
        self.assertEqual(report.fixed, 1)
        self.assertEqual(report.errors, 1)
        self.assertEqual([r.table for r in report.results], [
            "broken_table",
            "good_table",
            "no_sequence_table",
        ])
        self.assertEqual({r.table: r.action for r in report.results}, {
            "no_sequence_table": "skipped_no_sequence",
            "broken_table": "error",
            "good_table": "fixed",
        })
        joined = "\n".join(logs.output)
        self.assertIn("[postgres_sequence_sync] summary", joined)
        self.assertIn("errors=1", joined)
        # No per-table ERROR spam
        self.assertNotIn("table=broken_table error=setval failed", joined)
    @patch("backend.db.postgres_sequence_sync._sync_table_sequence")
    def test_each_table_uses_its_own_transaction(self, mock_sync) -> None:
        mock_sync.return_value = _make_result("good_table", action="ok")

        ensure_postgres_sequences_synced(
            self.engine,
            metadata=self.metadata,
            table_names=["good_table", "broken_table"],
        )

        self.assertEqual(self.engine.begin.call_count, 2)
        for call in mock_sync.call_args_list:
            self.assertIs(call.args[0], self.conn)


if __name__ == "__main__":
    unittest.main()
