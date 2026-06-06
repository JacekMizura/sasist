"""
Replenishment execution steps.

  python -m pytest backend/tests/test_replenishment_execution.py -q
"""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.replenishment.execution_service import advance_replenishment_execution


class TestReplenishmentExecution(unittest.TestCase):
    @patch("backend.services.replenishment.execution_service.transition_task_state")
    def test_scan_source_moves_to_active(self, mock_transition):
        task = SimpleNamespace(
            id=1,
            orchestration_state="QUEUED",
            status="open",
            quantity_required=5.0,
            quantity_done=0.0,
            payload_json="{}",
            updated_at=None,
        )
        db = MagicMock()
        advance_replenishment_execution(db, task, step="scan_source", scan_code="LOC-A1")
        payload = json.loads(task.payload_json)
        self.assertEqual(payload["source_scan_code"], "LOC-A1")
        mock_transition.assert_called_once()

    @patch("backend.services.replenishment.execution_service.transition_task_state")
    def test_complete_sets_qty_done(self, mock_transition):
        task = SimpleNamespace(
            id=2,
            orchestration_state="ACTIVE",
            status="in_progress",
            quantity_required=8.0,
            quantity_done=0.0,
            payload_json="{}",
            updated_at=None,
        )
        db = MagicMock()
        advance_replenishment_execution(db, task, step="complete")
        self.assertEqual(task.quantity_done, 8.0)
        mock_transition.assert_called_once()


if __name__ == "__main__":
    unittest.main()
