"""
GET /order-issue-tasks request-path must ensure archive columns.

Reproduces prod-class failure: old ``order_issue_tasks`` without archived_* ,
lifecycle ensure alone adds priority_* but list SELECT still requires archived_at
→ OperationalError / UndefinedColumn → HTTP 500.

  python -m pytest backend/tests/test_order_issue_tasks_archive_request_path.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from backend.api.wms_order_issue_tasks import _build_order_issue_tasks_list
from backend.db.schema_introspection import get_table_column_names
from backend.models.customer import Customer
from backend.models.order import Order
from backend.models.order_issue_task import OrderIssueTask
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.services.order_issue_task_lifecycle import ensure_order_issue_task_lifecycle_schema
from backend.services.order_issue_task_service import list_open_order_issue_tasks_for_warehouse


def _create_legacy_order_issue_tasks_table(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE products (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE order_items (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE orders (id INTEGER PRIMARY KEY)"))
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
                VALUES (1, 1, 1, 100, 'MIXED', 'OPEN', '[]', '[]', '{}', '[]',
                        datetime('now'), datetime('now'))
                """
            )
        )


class ArchiveColumnsRequestPathTests(unittest.TestCase):
    def test_request_path_ensure_adds_archived_at_then_list_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        _create_legacy_order_issue_tasks_table(engine)
        cols_before = get_table_column_names(engine, "order_issue_tasks")
        self.assertNotIn("archived_at", cols_before)
        self.assertNotIn("priority_score", cols_before)

        Session = sessionmaker(bind=engine)
        db = Session()
        try:
            ensure_order_issue_task_lifecycle_schema(db)
            cols = get_table_column_names(engine, "order_issue_tasks")
            self.assertIn("archived_at", cols)
            self.assertIn("archived_by_user_id", cols)
            self.assertIn("priority_score", cols)

            for _ in range(3):
                rows = list_open_order_issue_tasks_for_warehouse(
                    db, tenant_id=1, warehouse_id=1
                )
                self.assertEqual(len(rows), 1)
                self.assertEqual(int(rows[0].id), 1)
                ensure_order_issue_task_lifecycle_schema(db)
        finally:
            db.close()


class BuildListAfterLegacySchemaTests(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        for model in (
            Tenant,
            Warehouse,
            Customer,
            OrderUiStatus,
            Product,
            Order,
            OrderItem,
            OrderIssueTask,
        ):
            # Create supporting tables via ORM, then drop/rebuild issue tasks as legacy.
            model.__table__.create(self.engine, checkfirst=True)
        with self.engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS order_issue_task_items"))
            conn.execute(text("DROP TABLE IF EXISTS order_issue_tasks"))
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
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Product(id=1, tenant_id=1, name="P", sku="P1", ean="1"))
        now = datetime.utcnow()
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number="LEGACY-1",
            status="MISSING",
            fulfillment_state="MISSING",
            total_volume_dm3=1.0,
            created_at=now,
        )
        self.db.add(o)
        self.db.flush()
        self.db.execute(
            text(
                """
                INSERT INTO order_issue_tasks
                (id, tenant_id, warehouse_id, order_id, type, status, missing_items, picked_items,
                 baseline_order_lines_json, logs_json, created_at, updated_at)
                VALUES (1, 1, 1, :oid, 'SHORTAGE', 'OPEN', '[]', '[]', '{}', '[]', :c, :u)
                """
            ),
            {"oid": int(o.id), "c": now.isoformat(), "u": now.isoformat()},
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_build_list_three_times_after_legacy_schema(self):
        for _ in range(3):
            resp = _build_order_issue_tasks_list(
                self.db, tenant_id=1, warehouse_id=1
            )
            self.assertTrue(resp.success)
            cols = get_table_column_names(self.engine, "order_issue_tasks")
            self.assertIn("archived_at", cols)
            self.assertIn("priority_score", cols)


if __name__ == "__main__":
    unittest.main()
