"""Tests for aggregated RELOCATION operational tasks (Phase 3 + carrier workflow)."""

from __future__ import annotations

import json
import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.models.wms_operational_task import (
    STATUS_DONE,
    STATUS_IN_PROGRESS,
    STATUS_OPEN,
    TASK_RELOCATION,
    TASK_SHORTAGE_RECOLLECT,
)
from backend.services.wms_operational_task_service import (
    _allocation_row_status,
    _all_allocations_relocated,
    append_relocation_allocations,
    assign_relocation_allocation,
    complete_relocation_task,
    group_key_relocation,
    merge_relocation_task,
    rebuild_relocation_payload,
    resolve_operational_task_scan,
)


class RebuildPayloadTests(unittest.TestCase):
    def test_rebuild_totals(self):
        allocs = [
            {"order_id": 1, "order_item_id": 10, "qty": 2, "target_zone": "PACK-A"},
            {"order_id": 2, "order_item_id": 20, "qty": 5, "target_zone": "PACK-B"},
        ]
        p = rebuild_relocation_payload(allocs, product_id=55, picked_from_location="KOSZYK-7")
        self.assertEqual(p["total_qty"], 7.0)


class PartialRelocationTests(unittest.TestCase):
    def test_partial_status(self):
        row = {"qty": 5.0, "relocated_qty": 2.0, "done": False}
        self.assertEqual(_allocation_row_status(row), "partial")
        self.assertFalse(_all_allocations_relocated([row]))

    def test_complete_when_all_relocated(self):
        rows = [
            {"order_id": 1, "order_item_id": 1, "qty": 2.0, "relocated_qty": 2.0, "done": True},
            {"order_id": 2, "order_item_id": 2, "qty": 3.0, "relocated_qty": 3.0, "done": True},
        ]
        self.assertTrue(_all_allocations_relocated(rows))


class AssignRelocationTests(unittest.TestCase):
    def _task(self, allocs):
        return SimpleNamespace(
            id=9,
            tenant_id=1,
            warehouse_id=1,
            product_id=55,
            task_type=TASK_RELOCATION,
            status=STATUS_OPEN,
            quantity_required=5.0,
            quantity_done=0.0,
            payload_json=json.dumps(
                {
                    "total_qty": 5.0,
                    "picked_from_location": "KOSZYK-1",
                    "lock_version": 0,
                    "session": {
                        "operator_id": 1,
                        "operator_name": "Test Op",
                        "started_at": datetime.now().isoformat(),
                        "last_activity_at": datetime.now().isoformat(),
                    },
                    "allocations": allocs,
                }
            ),
            completed_at=None,
            updated_at=None,
        )

    def test_partial_then_auto_complete(self):
        allocs = [{"order_id": 1, "order_item_id": 10, "qty": 5.0, "relocated_qty": 0.0}]
        task = self._task(allocs)
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = task

        with patch(
            "backend.services.wms_relocation_workflow.validate_carrier_for_relocation",
            return_value=("TOTE-1", "ACTIVE"),
        ), patch(
            "backend.services.wms_operational_task_service._record_carrier_manifest_for_relocation",
        ):
            out = assign_relocation_allocation(
                db,
                9,
                tenant_id=1,
                order_id=1,
                order_item_id=10,
                carrier_id=100,
                qty=2.0,
                performed_by_user_id=1,
            )
        self.assertEqual(out.status, STATUS_IN_PROGRESS)
        body = json.loads(out.payload_json)
        self.assertEqual(body["allocations"][0]["relocated_qty"], 2.0)
        self.assertEqual(body["allocations"][0]["carrier_id"], 100)

        with patch(
            "backend.services.wms_relocation_workflow.validate_carrier_for_relocation",
            return_value=("TOTE-2", "ACTIVE"),
        ), patch(
            "backend.services.wms_operational_task_service._record_carrier_manifest_for_relocation",
        ):
            out2 = assign_relocation_allocation(
                db,
                9,
                tenant_id=1,
                order_id=1,
                order_item_id=10,
                carrier_id=101,
                qty=3.0,
                performed_by_user_id=1,
                expected_version=1,
            )
        self.assertEqual(out2.status, STATUS_DONE)
        body2 = json.loads(out2.payload_json)
        self.assertTrue(body2["allocations"][0]["done"])

    def test_retry_assign_idempotent_when_done(self):
        allocs = [
            {
                "order_id": 1,
                "order_item_id": 10,
                "qty": 2.0,
                "relocated_qty": 2.0,
                "done": True,
                "carrier_id": 5,
            }
        ]
        task = self._task(allocs)
        task.status = STATUS_DONE
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = None
        with self.assertRaises(ValueError):
            assign_relocation_allocation(
                db,
                9,
                tenant_id=1,
                order_id=1,
                order_item_id=10,
                carrier_id=5,
                qty=1.0,
                record_carrier_manifest=False,
            )


class CompleteRelocationTests(unittest.TestCase):
    def test_complete_rejects_incomplete(self):
        payload = {
            "total_qty": 3,
            "allocations": [
                {
                    "order_id": 1,
                    "order_item_id": 2,
                    "qty": 3,
                    "relocated_qty": 1,
                    "done": False,
                }
            ],
        }
        task = SimpleNamespace(
            id=1,
            status=STATUS_IN_PROGRESS,
            quantity_required=3.0,
            quantity_done=1.0,
            payload_json=json.dumps(payload),
            completed_at=None,
            updated_at=None,
        )
        with self.assertRaises(ValueError):
            complete_relocation_task(MagicMock(), task)


class AppendAllocationsTests(unittest.TestCase):
    def test_idempotent_same_source_event(self):
        existing = [{"order_id": 1, "order_item_id": 10, "qty": 99, "source_event_id": "evt-a"}]
        new = [{"order_id": 1, "order_item_id": 10, "qty": 2}]
        merged = append_relocation_allocations(existing, new, source_event_id="evt-a")
        self.assertEqual(merged[0]["qty"], 2.0)


class MergeRelocationTaskTests(unittest.TestCase):
    def test_multiple_orders_one_task(self):
        db = MagicMock()
        stored: dict = {}

        def fake_upsert(db, **kwargs):
            t = SimpleNamespace(
                id=1,
                status=STATUS_OPEN,
                task_type=TASK_RELOCATION,
                payload_json=json.dumps(kwargs.get("payload") or {}),
                quantity_required=kwargs.get("quantity_required"),
                quantity_done=0.0,
                group_key=kwargs.get("group_key"),
            )
            stored["task"] = t
            return t

        with (
            patch(
                "backend.services.wms_operational_task_service._find_active_by_group_key",
                return_value=None,
            ),
            patch("backend.services.wms_operational_task_service._upsert_task", side_effect=fake_upsert),
            patch(
                "backend.services.wms_operational_task_service._location_label_for_product",
                return_value="A-1",
            ),
        ):
            merge_relocation_task(
                db,
                tenant_id=1,
                warehouse_id=1,
                product_id=55,
                allocations=[
                    {"order_id": 1001, "order_item_id": 10, "qty": 2},
                    {"order_id": 1002, "order_item_id": 11, "qty": 5},
                ],
                picked_from_location="KOSZYK-7",
                source_event_id="recovery_finalize:1:9",
            )
        self.assertEqual(stored["task"].group_key, group_key_relocation(1, 55))


class ResolveScanPriorityTests(unittest.TestCase):
    def test_relocation_priority_over_recollect(self):
        db = MagicMock()
        reloc = SimpleNamespace(
            id=2,
            task_type=TASK_RELOCATION,
            product_id=55,
            priority=0,
            status=STATUS_OPEN,
        )
        recollect = SimpleNamespace(
            id=1,
            task_type=TASK_SHORTAGE_RECOLLECT,
            product_id=55,
            priority=100,
            status=STATUS_OPEN,
        )
        pr = SimpleNamespace(id=55, ean="5901", sku=None, symbol=None, barcode=None)
        q = MagicMock()
        q.filter.return_value = q
        q.first.return_value = pr
        q2 = MagicMock()
        q2.filter.return_value = q2
        q2.all.return_value = [recollect, reloc]

        def query_side(model):
            if model.__name__ == "Product":
                return q
            return q2

        db.query.side_effect = query_side
        with patch(
            "backend.services.wms_relocation_workflow.resolve_relocation_scan",
            return_value=None,
        ):
            hit = resolve_operational_task_scan(db, tenant_id=1, warehouse_id=1, scan="5901")
        assert hit is not None
        self.assertEqual(hit.task_type, TASK_RELOCATION)


if __name__ == "__main__":
    unittest.main()
