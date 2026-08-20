"""Manufactured recovery: intake_disposition_json SSOT + snapshot + Z-PZ integrity."""

from __future__ import annotations

import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.returns.errors import RmzFinalizeError
from backend.services.returns.intake_disposition import (
    DISP_OUTLET_B,
    DISP_SALEABLE,
    DISP_SERVICE_C,
    all_fg_allocation_from_commercial,
    physical_receivable_qty,
    project_aggregates_from_allocation,
    required_allocation_from_commercial,
    try_deterministic_legacy_conversion,
    validate_allocation_against_commercial,
)
from backend.services.returns.manufactured_component_recovery_service import (
    RECOVERY_MODE_OPTIONAL,
    RECOVERY_MODE_REQUIRED,
    assert_manufacturing_recovery_ready_for_warehouse_commit,
    resolve_line_allocation_for_commit,
)
from backend.services.returns.rmz_workflow_config_service import (
    RETURNS_WORKFLOW_VERSION,
    RmzWorkflowSnapshot,
    read_rmz_workflow_snapshot,
    stamp_rmz_snapshot_on_create,
)


class TestPhysicalReceivable(unittest.TestCase):
    def test_excludes_rejected(self) -> None:
        self.assertEqual(
            physical_receivable_qty(accepted_qty=4, damaged_b_qty=2, damaged_c_qty=0),
            6,
        )


class TestAllocationInvariants(unittest.TestCase):
    def test_bucket_must_match(self) -> None:
        rows = [
            {"disposition": DISP_SALEABLE, "fg_qty": 2, "disassembly_qty": 2},
            {"disposition": DISP_OUTLET_B, "fg_qty": 0, "disassembly_qty": 2},
            {"disposition": DISP_SERVICE_C, "fg_qty": 0, "disassembly_qty": 0},
        ]
        validate_allocation_against_commercial(
            rows, accepted_qty=4, damaged_b_qty=2, damaged_c_qty=0
        )
        with self.assertRaises(RmzFinalizeError):
            validate_allocation_against_commercial(
                rows, accepted_qty=4, damaged_b_qty=1, damaged_c_qty=0
            )

    def test_required_all_dq(self) -> None:
        rows = required_allocation_from_commercial(accepted_qty=2, damaged_b_qty=2, damaged_c_qty=0)
        self.assertEqual(rows[0]["disassembly_qty"], 2)
        self.assertEqual(rows[1]["disassembly_qty"], 2)
        fg, dq, mode = project_aggregates_from_allocation(rows)
        self.assertEqual(fg, 0)
        self.assertEqual(dq, 4)
        self.assertEqual(mode, "DISASSEMBLE")


class TestLegacyConversion(unittest.TestCase):
    def test_ambiguous_multi_bucket_blocks(self) -> None:
        ln = SimpleNamespace(
            intake_disposition_json=None,
            accepted_qty=4,
            damaged_b_qty=2,
            damaged_c_qty=0,
            fg_intake_qty=0,
            disassembly_qty=4,
            stock_intake_mode="DISASSEMBLE",
        )
        self.assertIsNone(try_deterministic_legacy_conversion(ln, recovery_mode="OPTIONAL"))
        with self.assertRaises(RmzFinalizeError):
            resolve_line_allocation_for_commit(ln, recovery_mode="OPTIONAL")

    def test_single_bucket_legacy_ok(self) -> None:
        ln = SimpleNamespace(
            intake_disposition_json=None,
            accepted_qty=4,
            damaged_b_qty=0,
            damaged_c_qty=0,
            fg_intake_qty=0,
            disassembly_qty=4,
            stock_intake_mode="DISASSEMBLE",
        )
        rows = try_deterministic_legacy_conversion(ln, recovery_mode="OPTIONAL")
        assert rows is not None
        self.assertEqual(rows[0]["disassembly_qty"], 4)
        self.assertEqual(rows[0]["fg_qty"], 0)


class TestSnapshotStamp(unittest.TestCase):
    def test_stamp_includes_mfg(self) -> None:
        settings = SimpleNamespace(
            require_condition=True,
            require_photos=False,
            refund_processing="warehouse",
            returns_mode="two_step",
            enable_refund=True,
            manufactured_component_recovery_mode="OPTIONAL",
            manufactured_recovery_receipt_mode="STANDARD_PUTAWAY",
            manufactured_recovery_location_id=None,
        )
        row = SimpleNamespace(
            returns_workflow_version=None,
            require_condition=None,
            require_photos=None,
            refund_processing=None,
            manufactured_component_recovery_mode=None,
            manufactured_recovery_receipt_mode=None,
            manufactured_recovery_location_id=None,
        )
        stamp_rmz_snapshot_on_create(row, settings)  # type: ignore[arg-type]
        self.assertEqual(row.manufactured_component_recovery_mode, "OPTIONAL")
        self.assertEqual(row.manufactured_recovery_receipt_mode, "STANDARD_PUTAWAY")
        self.assertEqual(row.returns_workflow_version, RETURNS_WORKFLOW_VERSION)
        snap = read_rmz_workflow_snapshot(row)  # type: ignore[arg-type]
        assert snap is not None
        self.assertEqual(snap.manufactured_component_recovery_mode, "OPTIONAL")


class TestRequiredCommitGate(unittest.TestCase):
    def test_required_without_intake_fails(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        ln = SimpleNamespace(
            id=1,
            product_id=9,
            accepted_qty=2,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=0,
            intake_disposition_json=None,
            fg_intake_qty=None,
            disassembly_qty=None,
            stock_intake_mode=None,
        )
        with patch(
            "backend.services.returns.manufactured_component_recovery_service.product_qualifies_for_manufacturing_recovery",
            return_value=True,
        ):
            with self.assertRaises(RmzFinalizeError):
                assert_manufacturing_recovery_ready_for_warehouse_commit(
                    db,
                    tenant_id=1,
                    rmz_line=ln,  # type: ignore[arg-type]
                    recovery_mode=RECOVERY_MODE_REQUIRED,
                    is_bundle_line=False,
                )

    def test_rejected_only_skips_gate(self) -> None:
        db = MagicMock()
        ln = SimpleNamespace(
            id=1,
            product_id=9,
            accepted_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            rejected_qty=1,
            intake_disposition_json=None,
        )
        with patch(
            "backend.services.returns.manufactured_component_recovery_service.product_qualifies_for_manufacturing_recovery",
            return_value=True,
        ):
            assert_manufacturing_recovery_ready_for_warehouse_commit(
                db,
                tenant_id=1,
                rmz_line=ln,  # type: ignore[arg-type]
                recovery_mode=RECOVERY_MODE_REQUIRED,
                is_bundle_line=False,
            )


class TestAllFgHelper(unittest.TestCase):
    def test_projection(self) -> None:
        rows = all_fg_allocation_from_commercial(accepted_qty=3, damaged_b_qty=1, damaged_c_qty=0)
        fg, dq, mode = project_aggregates_from_allocation(rows)
        self.assertEqual(fg, 4)
        self.assertEqual(dq, 0)
        self.assertEqual(mode, "FG")


class TestZpzAllocationEffect(unittest.TestCase):
    """Mandatory cases 3–5: Z-PZ FG from allocation only; components from sum(dq)."""

    def test_case3_mixed_a_b_rejected_zero_stock(self) -> None:
        # accepted=4, B=2, rejected=4 → A fg2/dq2, B fg0/dq2
        rows = [
            {"disposition": DISP_SALEABLE, "fg_qty": 2, "disassembly_qty": 2},
            {"disposition": DISP_OUTLET_B, "fg_qty": 0, "disassembly_qty": 2},
            {"disposition": DISP_SERVICE_C, "fg_qty": 0, "disassembly_qty": 0},
        ]
        validate_allocation_against_commercial(
            rows, accepted_qty=4, damaged_b_qty=2, damaged_c_qty=0
        )
        from backend.services.returns.intake_disposition import (
            fg_qty_for_disposition,
            total_disassembly_qty,
            total_fg_qty,
        )

        self.assertEqual(fg_qty_for_disposition(rows, DISP_SALEABLE), 2)
        self.assertEqual(fg_qty_for_disposition(rows, DISP_OUTLET_B), 0)
        self.assertEqual(total_fg_qty(rows), 2)
        self.assertEqual(total_disassembly_qty(rows), 4)
        # rejected never in allocation / never FG
        self.assertNotIn("REJECTED", {str(r["disposition"]) for r in rows})

    def test_case4_outlet_partial_fg_not_full_b(self) -> None:
        # B=2 with B fg1/dq1 → Z-PZ must be 1 OUTLET_B FG (+ components×1), not 2 B FG
        rows = [
            {"disposition": DISP_SALEABLE, "fg_qty": 0, "disassembly_qty": 0},
            {"disposition": DISP_OUTLET_B, "fg_qty": 1, "disassembly_qty": 1},
            {"disposition": DISP_SERVICE_C, "fg_qty": 0, "disassembly_qty": 0},
        ]
        validate_allocation_against_commercial(
            rows, accepted_qty=0, damaged_b_qty=2, damaged_c_qty=0
        )
        from backend.services.returns.intake_disposition import (
            fg_qty_for_disposition,
            total_disassembly_qty,
        )

        self.assertEqual(fg_qty_for_disposition(rows, DISP_OUTLET_B), 1)
        self.assertEqual(total_disassembly_qty(rows), 1)
        # Invariant: never emit damaged_b_qty as full FG alongside components
        self.assertNotEqual(fg_qty_for_disposition(rows, DISP_OUTLET_B), 2)

    def test_case5_required_all_dq_zero_fg(self) -> None:
        rows = required_allocation_from_commercial(
            accepted_qty=2, damaged_b_qty=2, damaged_c_qty=0
        )
        validate_allocation_against_commercial(
            rows, accepted_qty=2, damaged_b_qty=2, damaged_c_qty=0
        )
        fg, dq, mode = project_aggregates_from_allocation(rows)
        self.assertEqual(fg, 0)
        self.assertEqual(dq, 4)
        self.assertEqual(mode, "DISASSEMBLE")


if __name__ == "__main__":
    unittest.main()
