"""
GET /order-issue-tasks — regression for live 500 when orders.picking_handoff_mode missing.

Exact failure (prod-class / reproduced):
  sqlalchemy.exc.OperationalError
  (sqlite3.OperationalError) no such column: orders.picking_handoff_mode
  — on PostgreSQL: UndefinedColumn / ProgrammingError for the same column
  failing SQL: SELECT … orders.picking_handoff_mode … FROM orders WHERE id IN (…)
  call site: _fetch_orders_by_id (after OPEN OrderIssueTask rows exist)
  outer: list_order_issue_tasks → HTTP 500 order_issue_tasks_fetch_failed

  python -m pytest backend/tests/test_order_issue_tasks_handoff_column_500.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from backend.api.wms_order_issue_tasks import _build_order_issue_tasks_list, _fetch_orders_by_id
from backend.db.schema_introspection import get_table_column_names
from backend.models.customer import Customer
from backend.models.order import Order
from backend.models.order_issue_task import OrderIssueTask
from backend.models.order_item import OrderItem
from backend.models.order_ui_status import OrderUiStatus
from backend.models.product import Product
from backend.models.tenant import Tenant
from backend.models.warehouse import Warehouse
from backend.schemas.order_issue_task import BrakiOperationalState, BrakiWorkstreams, OrderIssueTaskListItem
from backend.services.order_issue_task_lifecycle import ensure_order_issue_task_lifecycle_schema
from backend.services.order_issue_task_service import list_open_order_issue_tasks_for_warehouse


def _strip_picking_handoff_mode(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE orders RENAME TO orders_full"))
        cols = [c["name"] for c in inspect(engine).get_columns("orders_full")]
        keep = [c for c in cols if c != "picking_handoff_mode"]
        col_defs = ", ".join(f'"{c}"' for c in keep)
        conn.execute(text(f"CREATE TABLE orders AS SELECT {col_defs} FROM orders_full"))
        conn.execute(text("DROP TABLE orders_full"))
    assert "picking_handoff_mode" not in get_table_column_names(engine, "orders")


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
        task_type=str(task.type or "SHORTAGE"),
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
        shortage_priority_score=0,
        shortage_priority_level="LOW",
        shortage_priority_label="Niski",
    )


class OrderIssueTasksHandoffColumn500Tests(unittest.TestCase):
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
            model.__table__.create(self.engine, checkfirst=True)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Warehouse(id=2, tenant_id=1, name="WH2"))
        self.db.add(Tenant(id=2, name="T2", default_warehouse_id=3))
        self.db.add(Warehouse(id=3, tenant_id=2, name="WH-T2"))
        self.db.add(Product(id=1, tenant_id=1, name="P", sku="P1", ean="1"))
        self.db.add(Product(id=2, tenant_id=2, name="P2", sku="P2", ean="2"))
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _seed_order(
        self,
        *,
        number: str,
        tenant_id: int = 1,
        warehouse_id: int = 1,
        product_id: int = 1,
        missing_qty: float = 1.0,
    ) -> Order:
        now = datetime.utcnow()
        o = Order(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            number=number,
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
                product_id=product_id,
                quantity=missing_qty,
                wms_picking_line_missing_qty=missing_qty,
                wms_shortage_declared_qty=missing_qty,
                wms_picking_line_status="missing",
            )
        )
        self.db.commit()
        self.db.refresh(o)
        return o

    def _add_open_task(self, order: Order, *, missing_items: str = "[]") -> OrderIssueTask:
        now = datetime.utcnow()
        t = OrderIssueTask(
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            type="SHORTAGE",
            status="OPEN",
            missing_items=missing_items,
            picked_items="[]",
            baseline_order_lines_json="{}",
            logs_json="[]",
            created_at=now,
            updated_at=now,
            priority_score=0,
            priority_level="LOW",
        )
        self.db.add(t)
        self.db.commit()
        self.db.refresh(t)
        return t

    def _build_list_ok(self, *, tenant_id: int, warehouse_id: int):
        with (
            patch(
                "backend.api.wms_order_issue_tasks.sync_open_issue_tasks_for_warehouse",
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
            return _build_order_issue_tasks_list(
                self.db, tenant_id=tenant_id, warehouse_id=warehouse_id
            )

    def test_i_live_500_missing_handoff_column_exact_exception_then_fixed(self):
        """I: exact LIVE 500 — missing orders.picking_handoff_mode."""
        o = self._seed_order(number="LIVE-1")
        self._add_open_task(o)
        self.db.commit()

        _strip_picking_handoff_mode(self.engine)
        self.db.expire_all()

        with self.assertRaises(OperationalError) as ei:
            _fetch_orders_by_id(self.db, [int(o.id)])
        self.assertIn("picking_handoff_mode", str(ei.exception.orig))
        self.db.rollback()

        resp = self._build_list_ok(tenant_id=1, warehouse_id=1)
        self.assertTrue(resp.success)
        self.assertEqual(len(resp.tasks), 1)
        self.assertEqual(resp.tasks[0].order_id, int(o.id))
        self.assertIn("picking_handoff_mode", get_table_column_names(self.engine, "orders"))

    def test_a_empty_tasks_200(self):
        """A: brak tasków → 200 []."""
        resp = self._build_list_ok(tenant_id=1, warehouse_id=1)
        self.assertTrue(resp.success)
        self.assertEqual(resp.tasks, [])

    def test_b_one_open_task_200(self):
        """B: jeden poprawny OPEN task → 200."""
        o = self._seed_order(number="B-1")
        self._add_open_task(o)
        self.db.commit()
        resp = self._build_list_ok(tenant_id=1, warehouse_id=1)
        self.assertTrue(resp.success)
        self.assertEqual(len(resp.tasks), 1)
        self.assertEqual(resp.tasks[0].status, "OPEN")

    def test_c_many_tasks_200(self):
        """C: wiele tasków → 200."""
        for i in range(3):
            o = self._seed_order(number=f"C-{i}")
            self._add_open_task(o)
        self.db.commit()
        resp = self._build_list_ok(tenant_id=1, warehouse_id=1)
        self.assertTrue(resp.success)
        self.assertEqual(len(resp.tasks), 3)

    def test_d_resolved_task_not_in_open_list(self):
        """D: historyczny/resolved — poza filtrem OPEN listy."""
        o = self._seed_order(number="D-1")
        t = self._add_open_task(o)
        t.status = "DONE"
        self.db.commit()
        rows = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=1)
        self.assertEqual(rows, [])
        resp = self._build_list_ok(tenant_id=1, warehouse_id=1)
        self.assertTrue(resp.success)
        self.assertEqual(resp.tasks, [])

    def test_e_legacy_missing_handoff_request_path_heals(self):
        """E: legacy schema bez handoff — ensure na request-path, brak 500."""
        o = self._seed_order(number="E-1")
        self._add_open_task(o)
        self.db.commit()
        _strip_picking_handoff_mode(self.engine)
        self.db.expire_all()

        ensure_order_issue_task_lifecycle_schema(self.db)
        self.assertIn("picking_handoff_mode", get_table_column_names(self.engine, "orders"))
        orders = _fetch_orders_by_id(self.db, [int(o.id)])
        self.assertIn(int(o.id), orders)

    def test_f_tenant_isolation(self):
        """F: tenant isolation."""
        o1 = self._seed_order(number="F-T1", tenant_id=1, warehouse_id=1, product_id=1)
        o2 = self._seed_order(number="F-T2", tenant_id=2, warehouse_id=3, product_id=2)
        self._add_open_task(o1)
        self._add_open_task(o2)
        self.db.commit()
        t1 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=1)
        t2 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=2, warehouse_id=3)
        self.assertEqual({int(t.order_id) for t in t1}, {int(o1.id)})
        self.assertEqual({int(t.order_id) for t in t2}, {int(o2.id)})

    def test_g_warehouse_isolation(self):
        """G: warehouse isolation."""
        o1 = self._seed_order(number="G-W1", warehouse_id=1)
        o2 = self._seed_order(number="G-W2", warehouse_id=2)
        self._add_open_task(o1)
        self._add_open_task(o2)
        self.db.commit()
        w1 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=1)
        w2 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=2)
        self.assertEqual({int(t.order_id) for t in w1}, {int(o1.id)})
        self.assertEqual({int(t.order_id) for t in w2}, {int(o2.id)})

    def test_h_no_source_stock_does_not_invent_replenishment(self):
        """H: task bez source stock — response OK, bez fałszywego replenishment CTA."""
        o = self._seed_order(number="H-1")
        self._add_open_task(
            o,
            missing_items='[{"sku":"P1","quantity_missing":1,"reason":"NO_SOURCE_STOCK"}]',
        )
        self.db.commit()
        resp = self._build_list_ok(tenant_id=1, warehouse_id=1)
        self.assertTrue(resp.success)
        self.assertEqual(len(resp.tasks), 1)
        card = resp.tasks[0]
        self.assertFalse(card.recovery_has_relocation_work)
        self.assertIsNone(card.relocation_task_id)
        dumped = card.model_dump()
        self.assertNotIn("create_replenishment", str(dumped).lower())
        self.assertNotIn("utwórz przesunięcie", str(dumped).lower())


if __name__ == "__main__":
    unittest.main()
