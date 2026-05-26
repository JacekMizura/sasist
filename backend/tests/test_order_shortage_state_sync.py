"""Testy spójności workflow braków: kolejka WMS, status panelu, fulfillment."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.order_fulfillment_recompute import (
    order_has_waiting_for_stock_lines,
    order_requires_shortage_handling,
)


class OrderRequiresShortageHandlingTests(unittest.TestCase):
    def test_waiting_for_stock_lines(self):
        order = SimpleNamespace(
            items=[
                SimpleNamespace(
                    metadata_json='{"oms_waiting_for_stock": true}',
                )
            ]
        )
        self.assertTrue(order_has_waiting_for_stock_lines(order))

    def test_no_workload_when_all_clear(self):
        order = SimpleNamespace(items=[SimpleNamespace(metadata_json=None)])
        db = MagicMock()
        with patch(
            "backend.services.order_issue_task_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ):
            self.assertFalse(order_requires_shortage_handling(db, order))

    def test_unresolved_shortage_requires_handling(self):
        order = SimpleNamespace(items=[])
        db = MagicMock()
        with patch(
            "backend.services.order_issue_task_service.count_issue_queue_operational_lines",
            return_value=(2, 0),
        ):
            self.assertTrue(order_requires_shortage_handling(db, order))

    def test_substitute_pick_pending_requires_handling(self):
        order = SimpleNamespace(items=[])
        db = MagicMock()
        with patch(
            "backend.services.order_issue_task_service.count_issue_queue_operational_lines",
            return_value=(0, 1),
        ):
            self.assertTrue(order_requires_shortage_handling(db, order))

    def test_waiting_requires_handling_even_without_operational_missing(self):
        order = SimpleNamespace(
            items=[SimpleNamespace(metadata_json='{"oms_waiting_for_stock": true}')]
        )
        db = MagicMock()
        with patch(
            "backend.services.order_issue_task_service.count_issue_queue_operational_lines",
            return_value=(0, 0),
        ):
            self.assertTrue(order_requires_shortage_handling(db, order))


if __name__ == "__main__":
    unittest.main()
