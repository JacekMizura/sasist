"""Inventory count module — schema smoke tests."""

from __future__ import annotations

import unittest

from sqlalchemy import inspect

from backend.database import engine
from backend.db.inventory_count_schema import ensure_inventory_count_schema


class TestInventoryCountSchema(unittest.TestCase):
    def test_tables_exist_after_ensure(self):
        ensure_inventory_count_schema(engine)
        insp = inspect(engine)
        for table in (
            "inventory_documents",
            "inventory_document_lines",
            "inventory_count_entries",
            "inventory_snapshots",
            "inventory_tasks",
            "inventory_sessions",
            "inventory_audit_events",
        ):
            self.assertTrue(insp.has_table(table), f"missing table {table}")


if __name__ == "__main__":
    unittest.main()
