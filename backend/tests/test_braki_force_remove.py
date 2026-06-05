"""
Force remove z kolejki Braki — operator zawsze może wyjść z deadlocku.

  python -m pytest backend/tests/test_braki_force_remove.py -q
"""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.recovery_workflow_service import (
    force_remove_braki_order,
    snapshot_braki_active_operations,
)


def _task(**kwargs):
    defaults = {
        "id": 12,
        "tenant_id": 1,
        "warehouse_id": 1,
        "order_id": 200,
        "status": "OPEN",
        "logs_json": "[]",
        "archived_at": None,
        "archived_by_user_id": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(**kwargs):
    defaults = {
        "id": 200,
        "tenant_id": 1,
        "warehouse_id": 1,
        "fulfillment_state": "PICKING",
        "items": [SimpleNamespace(id=1, product_id=5, quantity=1)],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _state(**kwargs):
    defaults = {
        "packing_allowed": False,
        "recovery_status": "recovery_pending",
        "has_recovery_pick_work": True,
        "has_pending_relocation": True,
        "state_hash": "abc",
        "totals": SimpleNamespace(oms_decision_lines=1, recovery_lines=1, unresolved_lines=1),
        "lines": [SimpleNamespace(visible_in_relocation=True)],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestBrakiForceRemove(unittest.TestCase):
    def test_snapshot_detects_active_operations(self):
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.recovery_workflow_service.resolve_order_recovery_state",
            return_value=_state(),
        ), patch(
            "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
            return_value=SimpleNamespace(id=9),
        ):
            snap = snapshot_braki_active_operations(db, order)
        self.assertTrue(snap["recovery_task"])
        self.assertTrue(snap["relocation_task"])
        self.assertTrue(snap["oms_decision"])

    def test_force_remove_closes_ops_and_archives(self):
        task = _task()
        order = _order()
        db = MagicMock()
        st = _state(
            has_recovery_pick_work=False,
            has_pending_relocation=False,
            totals=SimpleNamespace(oms_decision_lines=1, recovery_lines=0, unresolved_lines=0),
            lines=[],
        )
        with patch(
            "backend.services.recovery_workflow_service.close_braki_operational_workflows_for_order",
        ) as close_mock, patch(
            "backend.services.recovery_workflow_service.apply_fulfillment_state_from_resolver",
            return_value=st,
        ), patch(
            "backend.services.recovery_workflow_service.snapshot_braki_active_operations",
            side_effect=[
                {
                    "recovery_task": True,
                    "relocation_task": True,
                    "oms_decision": True,
                    "packing_transition": False,
                },
                {
                    "recovery_task": False,
                    "relocation_task": False,
                    "oms_decision": True,
                    "packing_transition": False,
                },
            ],
        ), patch(
            "backend.services.order_issue_task_service.archive_issue_task_record",
            return_value={"archived": True, "already_archived": False},
        ) as archive_mock:
            result = force_remove_braki_order(
                db,
                order,
                task,
                mode="full",
                operator_user_id=7,
            )
        close_mock.assert_called_once_with(db, order)
        archive_mock.assert_called_once()
        self.assertTrue(result["archived"])
        self.assertEqual(result["mode"], "full")


if __name__ == "__main__":
    unittest.main()
