"""RELOCATION session locking, carrier validation, resume, concurrency."""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.wms_relocation_workflow import (
    SESSION_TIMEOUT_SECONDS,
    RelocationSessionLockedError,
    _is_session_expired,
    acquire_relocation_session,
    release_relocation_session,
    require_session_can_assign,
    session_view_from_payload,
    validate_carrier_for_relocation,
)
from backend.services.wms_operational_task_service import assign_relocation_allocation


def _fresh_session(operator_id: int = 1, **extra) -> dict:
    now = datetime.now().isoformat()
    base = {
        "operator_id": operator_id,
        "operator_name": f"Op {operator_id}",
        "started_at": now,
        "last_activity_at": now,
        "active_carrier_id": extra.get("active_carrier_id"),
        "active_carrier_label": extra.get("active_carrier_label"),
    }
    base.update(extra)
    return base


class SessionTimeoutTests(unittest.TestCase):
    def test_expired_after_timeout(self):
        old = datetime.utcnow() - timedelta(seconds=SESSION_TIMEOUT_SECONDS + 30)
        session = {
            "operator_id": 1,
            "started_at": old.isoformat(),
            "last_activity_at": old.isoformat(),
        }
        self.assertTrue(_is_session_expired(session))

    def test_active_within_timeout(self):
        session = _fresh_session()
        self.assertFalse(_is_session_expired(session))


class SessionTakeoverTests(unittest.TestCase):
    def test_blocks_second_operator_without_takeover(self):
        db = MagicMock()
        task = SimpleNamespace(
            id=5,
            tenant_id=1,
            status="open",
            payload_json=json.dumps({"session": _fresh_session(operator_id=1)}),
            updated_at=None,
        )
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = task
        with self.assertRaises(RelocationSessionLockedError):
            acquire_relocation_session(
                db,
                5,
                tenant_id=1,
                operator_id=2,
                operator_name="Op 2",
                takeover=False,
            )

    def test_takeover_replaces_holder(self):
        db = MagicMock()
        task = SimpleNamespace(
            id=5,
            tenant_id=1,
            status="open",
            payload_json=json.dumps(
                {
                    "session": _fresh_session(operator_id=1, active_carrier_id=99, active_carrier_label="WÓZEK-12"),
                    "lock_version": 0,
                }
            ),
            updated_at=None,
        )
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = task
        _, view = acquire_relocation_session(
            db,
            5,
            tenant_id=1,
            operator_id=2,
            operator_name="Op 2",
            takeover=True,
        )
        self.assertEqual(view.operator_id, 2)
        self.assertTrue(view.is_holder)
        body = json.loads(task.payload_json)
        self.assertEqual(body["session"]["operator_id"], 2)
        self.assertEqual(body["session"]["active_carrier_id"], 99)


class ResumeRelocationTests(unittest.TestCase):
    def test_session_view_restores_active_carrier(self):
        payload = {
            "session": _fresh_session(active_carrier_id=42, active_carrier_label="TOTE-A"),
            "lock_version": 3,
        }
        view = session_view_from_payload(payload, requesting_operator_id=1)
        assert view is not None
        self.assertEqual(view.active_carrier_id, 42)
        self.assertEqual(view.active_carrier_label, "TOTE-A")
        self.assertTrue(view.can_edit)


class CarrierValidationTests(unittest.TestCase):
    def test_archived_carrier_rejected(self):
        db = MagicMock()
        carrier = SimpleNamespace(
            id=10,
            tenant_id=1,
            deleted_at=None,
            status="ARCHIVED",
            barcode="X",
            code=None,
            name=None,
            locked_by_user_id=None,
        )
        db.query.return_value.filter.return_value.first.return_value = carrier
        with self.assertRaises(ValueError) as ctx:
            validate_carrier_for_relocation(db, tenant_id=1, carrier_id=10)
        self.assertIn("ARCHIVED", str(ctx.exception))


class RequireSessionTests(unittest.TestCase):
    def test_assign_requires_active_session(self):
        payload = {"allocations": []}
        with self.assertRaises(ValueError):
            require_session_can_assign(payload, operator_id=1)


class DoubleOperatorRaceTests(unittest.TestCase):
    def test_version_conflict_on_stale_lock(self):
        from backend.services.wms_relocation_workflow import _check_payload_version

        payload = {"lock_version": 5}
        with self.assertRaises(ValueError):
            _check_payload_version(payload, expected_version=4)


class AssignWithSessionTests(unittest.TestCase):
    def test_assign_updates_session_carrier(self):
        allocs = [{"order_id": 1, "order_item_id": 10, "qty": 5.0, "relocated_qty": 0.0}]
        task = SimpleNamespace(
            id=9,
            tenant_id=1,
            warehouse_id=1,
            product_id=55,
            task_type="RELOCATION",
            status="in_progress",
            quantity_required=5.0,
            quantity_done=0.0,
            payload_json=json.dumps(
                {
                    "lock_version": 0,
                    "session": _fresh_session(operator_id=1),
                    "allocations": allocs,
                }
            ),
            completed_at=None,
            updated_at=None,
        )
        db = MagicMock()
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = task
        with patch(
            "backend.services.wms_relocation_workflow.validate_carrier_for_relocation",
            return_value=("KOSZ-1", "ACTIVE"),
        ), patch(
            "backend.services.wms_operational_task_service._record_carrier_manifest_for_relocation",
        ):
            assign_relocation_allocation(
                db,
                9,
                tenant_id=1,
                order_id=1,
                order_item_id=10,
                carrier_id=100,
                qty=2.0,
                performed_by_user_id=1,
                expected_version=0,
            )
        body = json.loads(task.payload_json)
        self.assertEqual(body["session"]["active_carrier_id"], 100)
        self.assertEqual(body["lock_version"], 1)
        hist = body.get("history") or []
        self.assertTrue(any(h.get("action") == "assign" for h in hist))


class SessionReleaseTests(unittest.TestCase):
    def test_release_clears_session(self):
        db = MagicMock()
        task = SimpleNamespace(
            id=1,
            tenant_id=1,
            status="in_progress",
            payload_json=json.dumps({"session": _fresh_session(operator_id=1), "lock_version": 0}),
            updated_at=None,
        )
        db.query.return_value.filter.return_value.with_for_update.return_value.first.return_value = task
        release_relocation_session(
            db, 1, tenant_id=1, operator_id=1, operator_name="Op 1"
        )
        body = json.loads(task.payload_json)
        self.assertIsNone(body.get("session"))


if __name__ == "__main__":
    unittest.main()
