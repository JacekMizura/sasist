"""
Relocation status tylko przy aktywnych alokacjach (nie historia zadań done).

  python -m pytest backend/tests/test_braki_relocation_active_gate.py -q
"""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.braki_workflow_service import (
    BRAKI_FILTER_READY_PACK,
    BRAKI_FILTER_RELOCATION,
    resolve_braki_workflow_status,
)
from backend.services.wms_relocation_workflow import (
    find_relocation_task_for_order,
    order_has_active_relocation_work,
    relocation_alloc_counts_for_order,
)


def _order(**kwargs):
    defaults = {"id": 1171, "tenant_id": 1, "warehouse_id": 1, "items": []}
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _task(*, task_id: int = 99, status: str = "open", allocations: list):
    import json

    return SimpleNamespace(
        id=task_id,
        status=status,
        quantity_required=1.0,
        quantity_done=0.0,
        payload_json=json.dumps({"allocations": allocations}),
    )


class TestRelocationAllocCounts(unittest.TestCase):
    def test_legacy_recovery_finalize_allocation_not_active(self):
        """Udane picki z recovery finalize nie powinny blokować ready_pack."""
        task = _task(
            allocations=[
                {
                    "order_id": 1206,
                    "order_item_id": 10,
                    "qty": 1.0,
                    "relocated_qty": 0.0,
                    "done": False,
                    "source_event_id": "recovery_finalize:1206:9",
                }
            ]
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_relocation_workflow._find_relocation_task_with_any_alloc_for_order",
            return_value=task,
        ), patch(
            "backend.services.wms_operational_task_service.prune_invalid_relocation_allocations",
            return_value=True,
        ), patch(
            "backend.services.wms_operational_task_service._try_auto_complete_relocation_task",
        ):
            pending, partial, done = relocation_alloc_counts_for_order(
                db, tenant_id=1, warehouse_id=1, order_id=1206, task=task
            )
        self.assertEqual(pending, 0)
        self.assertEqual(partial, 0)

    def test_historical_done_allocation_not_active(self):
        task = _task(
            allocations=[
                {
                    "order_id": 1171,
                    "order_item_id": 10,
                    "qty": 1.0,
                    "relocated_qty": 1.0,
                    "done": True,
                    "relocation_reason": "PICKED_ITEM_REMOVED",
                    "source_event_id": "order_line_removed:10",
                }
            ]
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_relocation_workflow._find_relocation_task_with_any_alloc_for_order",
            return_value=task,
        ), patch(
            "backend.services.wms_operational_task_service._try_auto_complete_relocation_task",
        ):
            pending, partial, done = relocation_alloc_counts_for_order(
                db, tenant_id=1, warehouse_id=1, order_id=1171, task=task
            )
        self.assertEqual(pending, 0)
        self.assertEqual(partial, 0)
        self.assertEqual(done, 1)
        with patch(
            "backend.services.wms_relocation_workflow._find_relocation_task_with_any_alloc_for_order",
            return_value=task,
        ), patch(
            "backend.services.wms_operational_task_service._try_auto_complete_relocation_task",
        ):
            self.assertFalse(
                order_has_active_relocation_work(db, tenant_id=1, warehouse_id=1, order_id=1171)
            )
            self.assertIsNone(
                find_relocation_task_for_order(db, tenant_id=1, warehouse_id=1, order_id=1171)
            )

    def test_pending_allocation_is_active(self):
        task = _task(
            allocations=[
                {
                    "order_id": 1171,
                    "order_item_id": 10,
                    "qty": 2.0,
                    "relocated_qty": 0.0,
                    "done": False,
                    "relocation_reason": "PICKED_ITEM_REMOVED",
                    "source_event_id": "order_line_removed:10",
                }
            ]
        )
        db = MagicMock()
        with patch(
            "backend.services.wms_relocation_workflow._find_relocation_task_with_any_alloc_for_order",
            return_value=task,
        ):
            pending, partial, _ = relocation_alloc_counts_for_order(
                db, tenant_id=1, warehouse_id=1, order_id=1171, task=task
            )
        self.assertEqual(pending, 1)
        with patch(
            "backend.services.wms_relocation_workflow._find_relocation_task_with_any_alloc_for_order",
            return_value=task,
        ):
            self.assertTrue(
                order_has_active_relocation_work(db, tenant_id=1, warehouse_id=1, order_id=1171)
            )


class TestBrakiWorkflowRelocationGate(unittest.TestCase):
    def test_resolved_shortage_by_pick_no_relocation_ready_pack(self):
        """CASE 1/2: brak rozliczony pickiem, bez rozlokowania → ready_pack."""
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=True,
        ), patch(
            "backend.services.braki_order_state_service.evaluate_order_braki_state",
            return_value={"resolved": True, "final_status": "ready_pack"},
        ), patch(
            "backend.services.braki_workflow_service._order_relocation_alloc_states",
            return_value=(0, 0, 0),
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.braki_workflow_service.order_needs_warehouse_pick",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_customer_line",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_for_stock_lines",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_READY_PACK)

    def test_ready_pack_when_no_active_relocation(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=True,
        ), patch(
            "backend.services.braki_order_state_service.evaluate_order_braki_state",
            return_value={"resolved": True, "final_status": "ready_pack"},
        ), patch(
            "backend.services.braki_workflow_service._order_relocation_alloc_states",
            return_value=(0, 0, 1),
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.braki_workflow_service.order_needs_warehouse_pick",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_customer_line",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_for_stock_lines",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_READY_PACK)

    def test_relocation_when_pending_alloc(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=False,
        ), patch(
            "backend.services.braki_order_state_service.evaluate_order_braki_state",
            return_value={"resolved": False, "final_status": "relocation"},
        ), patch(
            "backend.services.braki_workflow_service._order_relocation_alloc_states",
            return_value=(1, 0, 0),
        ), patch(
            "backend.services.braki_workflow_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ), patch(
            "backend.services.braki_workflow_service.order_needs_warehouse_pick",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_customer_line",
            return_value=False,
        ), patch(
            "backend.services.braki_workflow_service.order_has_waiting_for_stock_lines",
            return_value=False,
        ), patch(
            "backend.services.order_fulfillment_recompute.compute_line_missing_qty",
            return_value=0.0,
        ):
            status = resolve_braki_workflow_status(db, order)
        self.assertEqual(status, BRAKI_FILTER_RELOCATION)


if __name__ == "__main__":
    unittest.main()
