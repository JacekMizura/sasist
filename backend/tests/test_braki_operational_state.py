"""
Stan operacyjny Braki — jedno źródło prawdy (resolver).

  python -m pytest backend/tests/test_braki_operational_state.py -q
"""

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.api.wms_order_issue_tasks import (
    serialize_order_issue_task_item,
    serialize_order_issue_task_list_card,
)
from backend.schemas.order_issue_task import (
    BrakiActiveOperations,
    BrakiOperationalState,
    BrakiWorkstreams,
    OrderIssueOrderContext,
)
from backend.services.recovery_workflow_service import (
    build_braki_operational_state,
    can_remove_from_braki,
)


def _mock_op_bundle(*, queue_stage: str = "relocation", workflow_stage: str = "rozlokowanie · gotowe do pakowania"):
    ws = BrakiWorkstreams(
        has_relocation_work=True,
        has_packing_ready=True,
        relocation_line_count=2,
        packing_ready_line_count=3,
        pick_line_count=0,
        oms_line_count=0,
        collected_line_count=1,
    )
    op_state = BrakiOperationalState(
        workflow_stage=workflow_stage,
        queue_stage=queue_stage,
        operational_mode="MIXED",
        can_remove_from_braki=True,
        can_close_shortage=True,
        active_operations=BrakiActiveOperations(),
        braki_workstreams=ws,
        packing_allowed=True,
        relocation_required=True,
        recovery_required=False,
        warnings=[],
        state_hash="abc",
        shortage_lifecycle_phase="RELOCATION_REQUIRED",
    )
    return {
        "braki_operational_state": op_state,
        "braki_workflow_status": queue_stage,
        "braki_workflow_status_label": workflow_stage,
        "issue_queue_summary_line": workflow_stage,
        "issue_queue_status_label": workflow_stage,
        "unresolved_shortage_count": 0,
        "replacement_pick_pending_count": 2,
        "recovery_packing_allowed": True,
        "recovery_active_lines": 0,
        "recovery_unresolved_lines": 0,
        "recovery_has_relocation_work": True,
        "can_close_shortage": True,
        "recovery_state_hash": "abc",
        "shortage_lifecycle_phase": "RELOCATION_REQUIRED",
        "braki_workstreams": ws,
        "partial_data": False,
        "queue_warnings": [],
        "order_context": OrderIssueOrderContext(),
        "shortage_lines": [],
    }


class TestBrakiOperationalState(unittest.TestCase):
    def test_can_remove_when_no_active_sessions(self):
        order = SimpleNamespace(id=1197, tenant_id=1, warehouse_id=1)
        db = MagicMock()
        locks = {
            "recovery_session": False,
            "relocation_session": False,
            "packing_session": False,
            "oms_locked": False,
        }
        with patch(
            "backend.services.recovery_workflow_service.detect_active_braki_locks",
            return_value=locks,
        ):
            self.assertTrue(can_remove_from_braki(db, order))

    def test_list_and_detail_share_workflow_stage(self):
        task = SimpleNamespace(
            id=9,
            tenant_id=1,
            warehouse_id=1,
            order_id=1197,
            type="MIXED",
            status="OPEN",
            missing_items="[]",
            picked_items="[]",
            logs_json="[]",
            created_at=__import__("datetime").datetime(2026, 6, 4, 12, 0, 0),
        )
        order = SimpleNamespace(
            id=1197,
            number="Z-1197",
            status="processing",
            tenant_id=1,
            warehouse_id=1,
            order_ui_status=None,
            items=[],
            customer=None,
            addresses_json="{}",
        )
        db = MagicMock()
        bundle = _mock_op_bundle()

        with (
            patch(
                "backend.api.wms_order_issue_tasks.compute_recommended_action",
                return_value="MIXED",
            ),
            patch(
                "backend.api.wms_order_issue_tasks.compute_ui_decision",
                return_value=("PARTIAL", []),
            ),
            patch(
                "backend.api.wms_order_issue_tasks.first_pending_substitute_product",
                return_value=(0, ""),
            ),
            patch(
                "backend.api.wms_order_issue_tasks._build_task_operational_bundle",
                return_value=bundle,
            ),
            patch(
                "backend.api.wms_order_issue_tasks.braki_queue_bucket",
                return_value="recovery_ready",
            ),
        ):
            detail = serialize_order_issue_task_item(db, task, order)
            card = serialize_order_issue_task_list_card(db, task, order)

        self.assertEqual(
            detail.braki_operational_state.workflow_stage,
            card.braki_operational_state.workflow_stage,
        )
        self.assertEqual(detail.braki_workflow_status_label, card.braki_workflow_status_label)
        self.assertTrue(detail.braki_operational_state.can_remove_from_braki)
        self.assertTrue(card.braki_operational_state.can_remove_from_braki)
        self.assertFalse(detail.partial_data)
        self.assertFalse(card.partial_data)

    def test_build_braki_operational_state_mixed_label(self):
        order = SimpleNamespace(id=1197, tenant_id=1, warehouse_id=1)
        db = MagicMock()
        rec_state = SimpleNamespace(
            packing_allowed=True,
            has_recovery_pick_work=False,
            has_pending_relocation=True,
            totals=SimpleNamespace(unresolved_lines=0),
            state_hash="h1",
        )
        ws = {
            "has_pick_work": False,
            "has_relocation_work": True,
            "has_packing_ready": True,
            "has_oms_pending": False,
            "pick_line_count": 0,
            "relocation_line_count": 2,
            "packing_ready_line_count": 3,
            "oms_line_count": 0,
            "collected_line_count": 1,
        }
        with (
            patch(
                "backend.services.recovery_workflow_service.resolve_order_recovery_state",
                return_value=rec_state,
            ),
            patch(
                "backend.services.recovery_workflow_service.build_braki_workstreams_from_state",
                return_value=ws,
            ),
            patch(
                "backend.services.recovery_workflow_service.detect_active_braki_locks",
                return_value={
                    "recovery_session": False,
                    "relocation_session": False,
                    "packing_session": False,
                    "oms_locked": False,
                },
            ),
            patch(
                "backend.services.wms_relocation_workflow.find_relocation_task_for_order",
                return_value=None,
            ),
            patch(
                "backend.services.braki_order_state_service.order_fully_packed",
                return_value=False,
            ),
            patch(
                "backend.services.recovery_workflow_service.canonical_shortage_lifecycle_phase",
                return_value="RELOCATION_REQUIRED",
            ),
        ):
            op = build_braki_operational_state(
                db, order, tenant_id=1, warehouse_id=1, rec_state=rec_state, skip_repair=True
            )

        self.assertIn("rozlokowanie", op["workflow_stage"].lower())
        self.assertTrue(op["can_remove_from_braki"])
        self.assertTrue(op["braki_workstreams"]["has_relocation_work"])
        self.assertTrue(op["braki_workstreams"]["has_packing_ready"])


if __name__ == "__main__":
    unittest.main()
