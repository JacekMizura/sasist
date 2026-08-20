"""Returns workflow SSOT: refund_processing + RMZ snapshot + warehouse/office gates."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.services.returns.errors import RmzFinalizeError
from backend.services.returns.rmz_line_split_service import (
    assert_rmz_editable,
    assert_rmz_refundable,
    assert_rmz_warehouse_not_yet_committed,
)
from backend.services.returns.rmz_workflow_config_service import (
    RmzWorkflowSnapshot,
    derive_refund_processing_from_legacy,
    legacy_returns_mode_label,
    project_legacy_settings_columns,
    read_returns_settings_ssot,
    resolve_warehouse_commit_transition,
    validate_warehouse_commit_refund_payload,
)


class TestLegacyMigration(unittest.TestCase):
    def test_simple_maps_to_disabled(self) -> None:
        row = MagicMock()
        row.refund_processing = None
        row.returns_mode = "simple"
        row.enable_refund = False
        row.require_photos = False
        row.require_condition = False
        self.assertEqual(derive_refund_processing_from_legacy(row), "disabled")

    def test_two_step_maps_to_warehouse_never_office(self) -> None:
        row = MagicMock()
        row.refund_processing = None
        row.returns_mode = "two_step"
        row.enable_refund = True
        self.assertEqual(derive_refund_processing_from_legacy(row), "warehouse")

    def test_advanced_maps_to_warehouse(self) -> None:
        row = MagicMock()
        row.refund_processing = None
        row.returns_mode = "advanced"
        row.enable_refund = True
        self.assertEqual(derive_refund_processing_from_legacy(row), "warehouse")

    def test_stored_refund_processing_wins(self) -> None:
        row = MagicMock()
        row.refund_processing = "office"
        row.returns_mode = "two_step"
        row.enable_refund = True
        self.assertEqual(derive_refund_processing_from_legacy(row), "office")

    def test_project_legacy_columns(self) -> None:
        row = MagicMock()
        project_legacy_settings_columns(
            row, require_condition=True, require_photos=True, refund_processing="warehouse"
        )
        self.assertEqual(row.returns_mode, "advanced")
        self.assertTrue(row.enable_refund)
        self.assertEqual(row.refund_processing, "warehouse")

    def test_legacy_mode_label(self) -> None:
        self.assertEqual(legacy_returns_mode_label("disabled", False, False), "simple")
        self.assertEqual(legacy_returns_mode_label("warehouse", False, False), "two_step")
        self.assertEqual(legacy_returns_mode_label("office", False, False), "two_step")
        self.assertEqual(legacy_returns_mode_label("warehouse", True, True), "advanced")


def _snap(
    refund: str = "disabled",
    *,
    mfg_mode: str = "OFF",
    receipt: str = "STANDARD_PUTAWAY",
    loc: int | None = None,
) -> RmzWorkflowSnapshot:
    return RmzWorkflowSnapshot(
        2,
        False,
        False,
        refund,  # type: ignore[arg-type]
        mfg_mode,  # type: ignore[arg-type]
        receipt,  # type: ignore[arg-type]
        loc,
    )


class TestWarehouseCommitRefundGates(unittest.TestCase):
    def test_disabled_rejects_refund(self) -> None:
        snap = _snap("disabled")
        with self.assertRaises(RmzFinalizeError):
            validate_warehouse_commit_refund_payload(snap, process_refund=True, refund_type="PARTIAL")

    def test_office_rejects_refund_on_commit(self) -> None:
        snap = _snap("office")
        with self.assertRaises(RmzFinalizeError):
            validate_warehouse_commit_refund_payload(snap, process_refund=True, refund_type="NONE")

    def test_warehouse_allows_refund(self) -> None:
        snap = _snap("warehouse")
        validate_warehouse_commit_refund_payload(snap, process_refund=True, refund_type="PARTIAL")

    def test_office_commit_transition(self) -> None:
        snap = _snap("office")
        self.assertEqual(resolve_warehouse_commit_transition(snap, [], all_rejected=False), "office_pending")
        self.assertEqual(resolve_warehouse_commit_transition(snap, [], all_rejected=True), "rejected")

    def test_disabled_commit_success(self) -> None:
        snap = _snap("disabled")
        self.assertEqual(resolve_warehouse_commit_transition(snap, [], all_rejected=False), "success")


class TestEditableGuards(unittest.TestCase):
    def test_warehouse_content_locked_after_z_pz(self) -> None:
        row = MagicMock()
        row.warehouse_document_id = 99
        row.return_status = None
        with self.assertRaises(RmzFinalizeError):
            assert_rmz_editable(row)

    def test_refundable_allows_office_pending_with_z_pz(self) -> None:
        row = MagicMock()
        row.warehouse_document_id = 99
        rs = MagicMock()
        rs.transition_key = "office_pending"
        rs.type = "in_progress"
        row.return_status = rs
        assert_rmz_refundable(row)

    def test_refundable_allows_legacy_qc_complete(self) -> None:
        row = MagicMock()
        row.warehouse_document_id = 1
        rs = MagicMock()
        rs.transition_key = "qc_complete"
        rs.type = "in_progress"
        row.return_status = rs
        assert_rmz_refundable(row)

    def test_duplicate_warehouse_commit_blocked(self) -> None:
        row = MagicMock()
        row.warehouse_document_id = 5
        row.return_status = None
        with self.assertRaises(RmzFinalizeError):
            assert_rmz_warehouse_not_yet_committed(row)


class TestReadSsot(unittest.TestCase):
    def test_read_returns_settings_ssot(self) -> None:
        row = MagicMock()
        row.refund_processing = "office"
        row.require_photos = True
        row.require_condition = False
        row.manufactured_component_recovery_mode = "OFF"
        row.manufactured_recovery_receipt_mode = "STANDARD_PUTAWAY"
        row.manufactured_recovery_location_id = None
        snap = read_returns_settings_ssot(row)
        self.assertEqual(snap.refund_processing, "office")
        self.assertTrue(snap.require_photos)
        self.assertEqual(snap.manufactured_component_recovery_mode, "OFF")


if __name__ == "__main__":
    unittest.main()
