"""
GET /order-issue-tasks after shortage finalize — never 500; idempotent tasks.

  python -m unittest backend.tests.test_order_issue_tasks_after_shortage_finalize -q
"""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.api.wms_order_issue_tasks import _build_order_issue_tasks_list
from backend.db.schema_introspection import (
    ensure_order_issue_task_items_table,
    ensure_order_issue_tasks_lifecycle_columns,
    has_table,
)
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


def _list_card(task: OrderIssueTask, order: Order | None) -> OrderIssueTaskListItem:
    return OrderIssueTaskListItem(
        id=int(task.id),
        order_id=int(task.order_id),
        order_number=str(getattr(order, "number", None) or f"#{task.order_id}"),
        order_status=str(getattr(order, "status", None) or ""),
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
        order_ui_status_name=None,
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


class OrderIssueTasksAfterShortageFinalizeTests(unittest.TestCase):
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
        Session = sessionmaker(bind=self.engine)
        self.db = Session()
        self.db.add(Tenant(id=1, name="T", default_warehouse_id=1))
        self.db.add(Warehouse(id=1, tenant_id=1, name="WH"))
        self.db.add(Warehouse(id=2, tenant_id=1, name="WH2"))
        self.db.add(Tenant(id=2, name="T2", default_warehouse_id=3))
        self.db.add(Warehouse(id=3, tenant_id=2, name="WH-T2"))
        self.db.add(Product(id=1, tenant_id=1, name="P1", sku="P1", ean="5900000000001"))
        self.db.add(Product(id=2, tenant_id=2, name="P2", sku="P2", ean="5900000000002"))
        self.db.add(
            WmsPickingShortageSettings(
                tenant_id=1,
                warehouse_id=1,
                disable_auto_detach_missing_orders_from_carts=False,
            )
        )
        self.db.commit()

    def tearDown(self) -> None:
        self.db.close()
        self.engine.dispose()

    def _seed_shortage_order(
        self,
        *,
        number: str,
        tenant_id: int = 1,
        warehouse_id: int = 1,
        product_id: int = 1,
    ) -> Order:
        now = datetime.utcnow()
        o = Order(
            tenant_id=tenant_id,
            warehouse_id=warehouse_id,
            number=number,
            status="MISSING",
            fulfillment_state="MISSING",
            cart_id=None,
            picking_session_id=None,
            total_volume_dm3=1.0,
            created_at=now,
        )
        self.db.add(o)
        self.db.flush()
        self.db.add(
            OrderItem(
                order_id=int(o.id),
                product_id=product_id,
                quantity=2.0,
                wms_picking_line_missing_qty=2.0,
                wms_shortage_declared_qty=2.0,
                wms_picking_line_status="missing",
            )
        )
        self.db.commit()
        self.db.refresh(o)
        return o

    def _add_open_task(self, order: Order) -> OrderIssueTask:
        now = datetime.utcnow()
        t = OrderIssueTask(
            tenant_id=int(order.tenant_id),
            warehouse_id=int(order.warehouse_id),
            order_id=int(order.id),
            type="SHORTAGE",
            status="OPEN",
            missing_items="[]",
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

    def test_ensure_task_items_table_dialect_aware_when_missing(self):
        eng = create_engine("sqlite:///:memory:")
        OrderIssueTask.__table__.create(eng, checkfirst=True)
        self.assertFalse(has_table(eng, "order_issue_task_items"))
        ensure_order_issue_task_items_table(eng)
        self.assertTrue(has_table(eng, "order_issue_task_items"))
        ensure_order_issue_task_items_table(eng)

    def test_list_after_shortage_finalize_returns_200_shape(self):
        o1 = self._seed_shortage_order(number="1215")
        o2 = self._seed_shortage_order(number="1231")
        self._add_open_task(o1)
        self._add_open_task(o2)
        # Idempotent second "finalize" insert attempt — still one active per order
        self._add_open_task(o1)
        self.db.commit()

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
            # Deduplicate in list path is in-memory; DB may still have 3 OPEN rows for o1+o2
            rows = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=1)
            self.assertGreaterEqual(len(rows), 2)

            resp = _build_order_issue_tasks_list(self.db, tenant_id=1, warehouse_id=1)
            self.assertTrue(resp.success)
            self.assertEqual(len(resp.tasks), 2)
            self.assertEqual(len(resp.skipped_tasks), 0)

            resp2 = _build_order_issue_tasks_list(self.db, tenant_id=1, warehouse_id=1)
            self.assertEqual(len(resp2.tasks), 2)

    def test_tenant_and_warehouse_isolation(self):
        o_wh1 = self._seed_shortage_order(number="A1", warehouse_id=1)
        o_wh2 = self._seed_shortage_order(number="A2", warehouse_id=2)
        o_t2 = self._seed_shortage_order(number="B1", tenant_id=2, warehouse_id=3, product_id=2)
        self._add_open_task(o_wh1)
        self._add_open_task(o_wh2)
        self._add_open_task(o_t2)

        wh1 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=1)
        wh2 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=1, warehouse_id=2)
        t2 = list_open_order_issue_tasks_for_warehouse(self.db, tenant_id=2, warehouse_id=3)
        self.assertEqual({int(t.order_id) for t in wh1}, {int(o_wh1.id)})
        self.assertEqual({int(t.order_id) for t in wh2}, {int(o_wh2.id)})
        self.assertEqual({int(t.order_id) for t in t2}, {int(o_t2.id)})

    def test_sync_failure_rolls_back_then_list_still_returns(self):
        o = self._seed_shortage_order(number="SYNC")
        self._add_open_task(o)

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
            self.assertEqual(len(resp.tasks), 1)


if __name__ == "__main__":
    unittest.main()
