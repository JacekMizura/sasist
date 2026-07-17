"""FK cycle sort must emit one summary, not per-break spam."""

from __future__ import annotations

import unittest

from sqlalchemy import Column, ForeignKey, Integer, MetaData, Table

from backend.db.schema_reconciliation import _topological_sort_tables_fallback


class TestFkCycleLogSummary(unittest.TestCase):
    def test_cycle_breaks_logged_once(self) -> None:
        metadata = MetaData()
        # A → B → A cycle
        Table(
            "a_cyc",
            metadata,
            Column("id", Integer, primary_key=True),
            Column("b_id", Integer, ForeignKey("b_cyc.id")),
        )
        Table(
            "b_cyc",
            metadata,
            Column("id", Integer, primary_key=True),
            Column("a_id", Integer, ForeignKey("a_cyc.id")),
        )

        with self.assertLogs("backend.db.schema_reconciliation", level="WARNING") as logs:
            ordered = _topological_sort_tables_fallback(metadata)

        self.assertEqual(len(ordered), 2)
        joined = "\n".join(logs.output)
        self.assertIn("FK cycles detected:", joined)
        self.assertIn("Fallback topological sort enabled", joined)
        self.assertNotIn("fk_cycle_break", joined)
        # Exactly one warning record for the summary
        self.assertEqual(len(logs.output), 1)


if __name__ == "__main__":
    unittest.main()
