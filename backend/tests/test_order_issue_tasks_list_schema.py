"""
Kolejka braków — migracja kolumn archiwizacji przed odczytem OPEN zadań.

  python -m pytest backend/tests/test_order_issue_tasks_list_schema.py -q
"""

import unittest

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.db.schema_introspection import ensure_order_issue_tasks_archive_columns
from backend.services.order_issue_task_service import list_open_order_issue_tasks_for_warehouse


class TestOrderIssueTasksListSchema(unittest.TestCase):
    def test_list_open_tasks_after_archive_columns_migration(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.connect() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE order_issue_tasks (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        order_id INTEGER NOT NULL,
                        type VARCHAR(32) NOT NULL,
                        status VARCHAR(16) NOT NULL,
                        missing_items TEXT NOT NULL DEFAULT '[]',
                        picked_items TEXT NOT NULL DEFAULT '[]',
                        baseline_order_lines_json TEXT NOT NULL DEFAULT '{}',
                        logs_json TEXT NOT NULL DEFAULT '[]',
                        created_at DATETIME,
                        updated_at DATETIME
                    )
                    """
                )
            )
            conn.execute(
                text(
                    """
                    INSERT INTO order_issue_tasks
                    (id, tenant_id, warehouse_id, order_id, type, status, missing_items, picked_items,
                     baseline_order_lines_json, logs_json, created_at, updated_at)
                    VALUES (1, 1, 1, 100, 'MIXED', 'OPEN', '[]', '[]', '{}', '[]', datetime('now'), datetime('now'))
                    """
                )
            )
            conn.commit()

        ensure_order_issue_tasks_archive_columns(engine)
        Session = sessionmaker(bind=engine)
        db = Session()
        rows = list_open_order_issue_tasks_for_warehouse(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(int(rows[0].id), 1)
        db.close()


if __name__ == "__main__":
    unittest.main()
