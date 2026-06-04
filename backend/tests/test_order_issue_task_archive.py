"""
Archive braków — idempotentność + brak 500 przy liniach bez product_id.

  python -m pytest backend/tests/test_order_issue_task_archive.py -q
"""

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.order_issue_task_service import archive_order_issue_task


def _task(**kwargs):
    defaults = {
        "id": 8,
        "tenant_id": 1,
        "warehouse_id": 1,
        "order_id": 100,
        "status": "OPEN",
        "logs_json": "[]",
        "archived_at": None,
        "archived_by_user_id": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _order(**kwargs):
    defaults = {
        "id": 100,
        "tenant_id": 1,
        "warehouse_id": 1,
        "items": [SimpleNamespace(id=1, product_id=None, quantity=1)],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TestOrderIssueTaskArchive(unittest.TestCase):
    def test_already_archived_is_idempotent(self):
        task = _task(status="ARCHIVED", archived_at=datetime.utcnow())
        order = _order()
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_has_pending_relocation_work",
            return_value=False,
        ):
            result = archive_order_issue_task(db, task, order, operator_user_id=1)
        self.assertTrue(result["already_archived"])
        self.assertTrue(result["archived"])

    def test_archive_with_null_product_id_closes_operational_tasks(self):
        task = _task()
        order = _order(items=[SimpleNamespace(id=1, product_id=None)])
        db = MagicMock()
        with patch(
            "backend.services.braki_order_state_service.order_has_pending_relocation_work",
            return_value=False,
        ), patch(
            "backend.services.wms_recovery_pick_service.get_open_recovery_task_for_order",
            return_value=None,
        ), patch(
            "backend.services.braki_order_state_service.order_can_show_ready_pack",
            return_value=True,
        ), patch(
            "backend.services.wms_operational_task_service.close_operational_tasks_for_order",
        ) as close_mock:
            result = archive_order_issue_task(db, task, order, operator_user_id=5)
        close_mock.assert_called_once()
        self.assertEqual(task.status, "ARCHIVED")
        self.assertIsNotNone(task.archived_at)
        self.assertFalse(result["already_archived"])


if __name__ == "__main__":
    unittest.main()
