"""
Pre-push audit: PG-safe DDL, transaction recovery, GET idempotency, finalize atomicity.

  python -m unittest backend.tests.test_order_issue_tasks_prepush_audit -q
"""

from __future__ import annotations

import os
import unittest
from datetime import datetime
from unittest.mock import patch

from sqlalchemy import create_engine, event, text
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.schema import CreateTable

from backend.api.wms_order_issue_tasks import _build_order_issue_tasks_list
from backend.db.schema_introspection import (
    ensure_order_issue_task_items_table,
    ensure_order_issue_tasks_lifecycle_columns,
    ensure_wms_picking_shortage_settings_columns,
    get_table_column_names,
    has_table,
)
from backend.db.schema_upgrade import ensure_order_issue_tasks_table
from backend.models.customer import Customer
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_issue_task import OrderIssueTask
from backend.models.order_issue_task_item import OrderIssueTaskItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.models.wms_picking_shortage_settings import WmsPickingShortageSettings
from backend.schemas.order_issue_task import BrakiOperationalState, BrakiWorkstreams, OrderIssueTaskListItem
from backend.services.order_issue_task_service import list_open_order_issue_tasks_for_warehouse
from backend.services.wms_picking_product_list_service import PickingFinalizeError


def _pg_url() -> str | None:
    for key in ("TEST_DATABASE_URL", "DATABASE_URL", "POSTGRES_URL"):
        u = (os.environ.get(key) or "").strip()
        if u.startswith("postgres"):
            if u.startswith("postgres://"):
                u = u.replace("postgres://", "postgresql://", 1)
            return u
    return None


def _list_card(task: OrderIssueTask, order: Order | None) -> OrderIssueTaskListItem:
    return OrderIssueTaskListItem(
        id=int(task.id),
        order_id=int(task.order_id),
        order_number=str(getattr(order, "number", None) or f"#{task.order_id}"),
        order_status=str(getattr(order, "status", None) or "MISSING"),
        customer_name="—",
        delivery_name="—",
        customer_phone="—",
        customer_email="—",
        customer_address="—",
        unresolved_shortage_count=1,
        replacement_pick_pending_count=0,
        issue_queue_summary_line="decyzja OMS",
        issue_queue_status_label="decyzja OMS",
        substitute_product_id=0,
        substitute_product_name="",
        task_type=str(task.type),
        recommended_action="MIXED",
        ui_decision="PARTIAL",
        status=str(task.status),
        created_at=datetime.utcnow().isoformat() + "Z",
        last_shortage_at=datetime.utcnow().isoformat() + "Z",
        braki_queue_bucket="awaiting_oms",
        braki_workflow_status="awaiting",
        braki_workflow_status_label="decyzja OMS",
        braki_operational_state=BrakiOperationalState(),
        braki_workstreams=BrakiWorkstreams(has_oms_pending=True, oms_line_count=1),
        shortage_lifecycle_phase="AWAITING_OMS",
        shortage_priority_score=10,
        shortage_priority_level="LOW",
        shortage_priority_label="Niski",
    )


class PgDialectDdlSafetyTests(unittest.TestCase):
    def test_order_issue_task_items_create_table_has_no_sqlite_syntax(self):
        ddl = str(CreateTable(OrderIssueTaskItem.__table__).compile(dialect=postgresql.dialect()))
        self.assertNotIn("AUTOINCREMENT", ddl.upper())
        self.assertNotIn("datetime('now')", ddl)
        self.assertNotIn("DATETIME('NOW')", ddl.upper())

    def test_order_issue_tasks_create_table_has_no_sqlite_syntax(self):
        ddl = str(CreateTable(OrderIssueTask.__table__).compile(dialect=postgresql.dialect()))
        self.assertNotIn("AUTOINCREMENT", ddl.upper())
        self.assertNotIn("datetime('now')", ddl)


class SchemaEnsureIdempotencyTests(unittest.TestCase):
    def test_old_schema_then_ensure_then_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE warehouses (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE products (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE order_items (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE app_users (id INTEGER PRIMARY KEY)"))
            conn.execute(text("CREATE TABLE order_ui_statuses (id INTEGER PRIMARY KEY)"))
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
                    CREATE TABLE wms_picking_shortage_settings (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        warehouse_id INTEGER NOT NULL
                    )
                    """
                )
            )

        self.assertFalse(has_table(engine, "order_issue_task_items"))
        ensure_order_issue_task_items_table(engine)
        self.assertTrue(has_table(engine, "order_issue_task_items"))

        ensure_order_issue_tasks_lifecycle_columns(engine)
        cols = get_table_column_names(engine, "order_issue_tasks")
        self.assertIn("priority_score", cols)

        ensure_wms_picking_shortage_settings_columns(engine)
        scols = get_table_column_names(engine, "wms_picking_shortage_settings")
        self.assertIn("disable_auto_detach_missing_orders_from_carts", scols)

        # Idempotent re-run
        for _ in range(3):
            ensure_order_issue_tasks_table(engine)
            ensure_order_issue_task_items_table(engine)
            ensure_order_issue_tasks_lifecycle_columns(engine)
            ensure_wms_picking_shortage_settings_columns(engine)

        self.assertEqual(
            get_table_column_names(engine, "wms_picking_shortage_settings"),
            scols,
        )


@unittest.skipUnless(_pg_url(), "No PostgreSQL URL in TEST_DATABASE_URL/DATABASE_URL")
class RealPostgresBootstrapTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.url = _pg_url()
        assert cls.url
        cls.engine = create_engine(cls.url)
        with cls.engine.begin() as conn:
            conn.execute(text("DROP TABLE IF EXISTS order_issue_task_items CASCADE"))
            # leave order_issue_tasks if present; drop settings column if we can
            try:
                conn.execute(
                    text(
                        "ALTER TABLE wms_picking_shortage_settings "
                        "DROP COLUMN IF EXISTS disable_auto_detach_missing_orders_from_carts"
                    )
                )
            except Exception:
                pass

    def test_old_schema_ensure_then_list_usable(self):
        ensure_order_issue_tasks_table(self.engine)
        ensure_order_issue_task_items_table(self.engine)
        ensure_order_issue_tasks_lifecycle_columns(self.engine)
        ensure_wms_picking_shortage_settings_columns(self.engine)
        self.assertTrue(has_table(self.engine, "order_issue_task_items"))
        SessionLocal = sessionmaker(bind=self.engine)
        db = SessionLocal()
        try:
            db.execute(text("SELECT 1"))
            db.commit()
        finally:
            db.close()


class FailedTransactionRecoveryTests(unittest.TestCase):
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
            OrderIssueTaskItem,
            WmsPickingShortageSettings,
        ):
            model.__table__.create(self.engine, checkfirst=True)
        ensure_order_issue_tasks_lifecycle_columns(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Product(id=1, tenant_id=1, name="P", sku="P1", ean="1"))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_sync_failure_rolls_back_and_session_stays_usable(self):
        now = datetime.utcnow()
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number="T1",
            status="MISSING",
            fulfillment_state="MISSING",
            total_volume_dm3=1.0,
            created_at=now,
        )
        self.db.add(o)
        self.db.flush()
        self.db.add(
            OrderIssueTask(
                tenant_id=1,
                warehouse_id=1,
                order_id=int(o.id),
                type="SHORTAGE",
                status="OPEN",
                missing_items="[]",
                picked_items="[]",
                baseline_order_lines_json="{}",
                logs_json="[]",
                created_at=now,
                updated_at=now,
            )
        )
        self.db.commit()

        with (
            patch(
                "backend.api.wms_order_issue_tasks.sync_open_issue_tasks_for_warehouse",
                side_effect=RuntimeError("sync boom"),
            ),
            patch(
                "backend.api.wms_order_issue_tasks.order_requires_shortage_handling",
                return_value=True,
            ),
            patch(
                "backend.services.recovery_workflow_service.repair_order_relocation_consistency",
                return_value={},
            ),
            patch(
                "backend.api.wms_order_issue_tasks.serialize_order_issue_task_list_card",
                side_effect=lambda db, t, o, **kw: _list_card(t, o),
            ),
        ):
            resp = _build_order_issue_tasks_list(self.db, tenant_id=1, warehouse_id=1)
            self.assertTrue(resp.success)

        # Session must accept new work (not stuck in failed transaction)
        self.db.execute(text("SELECT 1"))
        self.db.commit()
        n = (
            self.db.query(OrderIssueTask)
            .filter(OrderIssueTask.tenant_id == 1, OrderIssueTask.status == "OPEN")
            .count()
        )
        self.assertEqual(n, 1)

    def test_nested_repair_failure_does_not_poison_parent(self):
        now = datetime.utcnow()
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number="T2",
            status="MISSING",
            fulfillment_state="MISSING",
            total_volume_dm3=1.0,
            created_at=now,
        )
        self.db.add(o)
        self.db.flush()
        self.db.add(
            OrderIssueTask(
                tenant_id=1,
                warehouse_id=1,
                order_id=int(o.id),
                type="SHORTAGE",
                status="OPEN",
                missing_items="[]",
                picked_items="[]",
                baseline_order_lines_json="{}",
                logs_json="[]",
                created_at=now,
                updated_at=now,
            )
        )
        self.db.commit()

        with (
            patch("backend.api.wms_order_issue_tasks.sync_open_issue_tasks_for_warehouse"),
            patch(
                "backend.api.wms_order_issue_tasks.order_requires_shortage_handling",
                return_value=True,
            ),
            patch(
                "backend.services.recovery_workflow_service.repair_order_relocation_consistency",
                side_effect=RuntimeError("repair boom"),
            ),
            patch(
                "backend.api.wms_order_issue_tasks.serialize_order_issue_task_list_card",
                side_effect=lambda db, t, o, **kw: _list_card(t, o),
            ),
        ):
            resp = _build_order_issue_tasks_list(self.db, tenant_id=1, warehouse_id=1)
            self.assertTrue(resp.success)
            self.assertEqual(len(resp.tasks), 1)

        self.db.execute(text("SELECT count(*) FROM order_issue_tasks"))
        self.db.commit()


class GetMutationIdempotencyTests(unittest.TestCase):
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
            OrderIssueTaskItem,
        ):
            model.__table__.create(self.engine, checkfirst=True)
        ensure_order_issue_tasks_lifecycle_columns(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Product(id=1, tenant_id=1, name="P", sku="P1", ean="1"))
        now = datetime.utcnow()
        o = Order(
            tenant_id=1,
            warehouse_id=1,
            number="IDEM",
            status="MISSING",
            fulfillment_state="MISSING",
            total_volume_dm3=1.0,
            created_at=now,
        )
        self.db.add(o)
        self.db.flush()
        self.db.add(
            OrderItem(
                order_id=int(o.id),
                product_id=1,
                quantity=1.0,
                wms_picking_line_missing_qty=1.0,
                wms_shortage_declared_qty=1.0,
            )
        )
        t = OrderIssueTask(
            tenant_id=1,
            warehouse_id=1,
            order_id=int(o.id),
            type="SHORTAGE",
            status="OPEN",
            missing_items="[]",
            picked_items="[]",
            baseline_order_lines_json="{}",
            logs_json="[]",
            created_at=now,
            updated_at=now,
        )
        self.db.add(t)
        self.db.flush()
        self.db.add(
            OrderIssueTaskItem(
                task_id=int(t.id),
                order_item_id=1,
                product_id=1,
                missing_qty=1.0,
                recovered_qty=0.0,
                status="OPEN",
                created_at=now,
                updated_at=now,
            )
        )
        self.db.commit()
        self.order_id = int(o.id)
        self.task_id = int(t.id)

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def test_three_gets_do_not_duplicate_tasks_or_items(self):
        with (
            patch("backend.api.wms_order_issue_tasks.sync_open_issue_tasks_for_warehouse"),
            patch(
                "backend.api.wms_order_issue_tasks.order_requires_shortage_handling",
                return_value=True,
            ),
            patch(
                "backend.services.recovery_workflow_service.repair_order_relocation_consistency",
                return_value={},
            ),
            patch(
                "backend.api.wms_order_issue_tasks.serialize_order_issue_task_list_card",
                side_effect=lambda db, t, o, **kw: _list_card(t, o),
            ),
        ):
            for _ in range(3):
                resp = _build_order_issue_tasks_list(self.db, tenant_id=1, warehouse_id=1)
                self.assertEqual(len(resp.tasks), 1)

        tasks = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=1)
        self.assertEqual(len(tasks), 1)
        items = (
            self.db.query(OrderIssueTaskItem)
            .filter(OrderIssueTaskItem.task_id == self.task_id)
            .count()
        )
        self.assertEqual(items, 1)


class FinalizeAtomicityDocTests(unittest.TestCase):
    def test_picking_finalize_error_is_subclass_of_exception_for_api_rollback(self):
        exc = PickingFinalizeError("boom", reason="x", step="braki_task", http_status=500, code="braki_task_schema_failed")
        self.assertIsInstance(exc, Exception)
        self.assertEqual(exc.code, "braki_task_schema_failed")
        self.assertEqual(exc.http_status, 500)


class ListPerformanceSmokeTests(unittest.TestCase):
    def _seed_n(self, n: int) -> Session:
        engine = create_engine("sqlite:///:memory:")
        for model in (
            Tenant,
            Warehouse,
            Customer,
            OrderUiStatus,
            Product,
            Order,
            OrderItem,
            OrderIssueTask,
            OrderIssueTaskItem,
        ):
            model.__table__.create(engine, checkfirst=True)
        ensure_order_issue_tasks_lifecycle_columns(engine)
        db = sessionmaker(bind=engine)()
        db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        db.add(Product(id=1, tenant_id=1, name="P", sku="P1", ean="1"))
        now = datetime.utcnow()
        for i in range(n):
            o = Order(
                tenant_id=1,
                warehouse_id=1,
                number=f"O{i}",
                status="MISSING",
                fulfillment_state="MISSING",
                total_volume_dm3=1.0,
                created_at=now,
            )
            db.add(o)
            db.flush()
            db.add(
                OrderIssueTask(
                    tenant_id=1,
                    warehouse_id=1,
                    order_id=int(o.id),
                    type="SHORTAGE",
                    status="OPEN",
                    missing_items="[]",
                    picked_items="[]",
                    baseline_order_lines_json="{}",
                    logs_json="[]",
                    created_at=now,
                    updated_at=now,
                )
            )
        db.commit()
        self._engine = engine
        return db

    def _count_queries(self, n: int) -> int:
        db = self._seed_n(n)
        counter = [0]

        def before(*_a, **_k):
            counter[0] += 1

        event.listen(self._engine, "before_cursor_execute", before)
        try:
            with (
                patch("backend.api.wms_order_issue_tasks.sync_open_issue_tasks_for_warehouse"),
                patch(
                    "backend.api.wms_order_issue_tasks.order_requires_shortage_handling",
                    return_value=True,
                ),
                patch(
                    "backend.services.recovery_workflow_service.repair_order_relocation_consistency",
                    return_value={},
                ),
                patch(
                    "backend.api.wms_order_issue_tasks.serialize_order_issue_task_list_card",
                    side_effect=lambda db, t, o, **kw: _list_card(t, o),
                ),
            ):
                resp = _build_order_issue_tasks_list(db, tenant_id=1, warehouse_id=1)
                self.assertEqual(len(resp.tasks), n)
        finally:
            event.remove(self._engine, "before_cursor_execute", before)
            db.close()
            self._engine.dispose()
        return counter[0]

    def test_query_scaling_reports(self):
        q10 = self._count_queries(10)
        q100 = self._count_queries(100)
        # With sync/serialize mocked: should be O(1) fetch + per-order loop for repair/require checks.
        # Expect roughly linear growth (N+1 pattern in loop), not quadratic.
        self.assertLess(q10, 80)
        self.assertLess(q100, 500)
        # Store for human report via print
        print(f"[perf] queries 10={q10} 100={q100}")


if __name__ == "__main__":
    unittest.main()
