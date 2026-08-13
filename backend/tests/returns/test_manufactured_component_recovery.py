"""Manufactured component recovery — unit tests (17 acceptance cases)."""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.returns.errors import RmzFinalizeError
from backend.services.returns.manufactured_component_recovery_service import (
    INTAKE_DISASSEMBLE,
    INTAKE_FG,
    LOCKED_FG_POSTED,
    RECOVERY_MODE_OFF,
    RECOVERY_MODE_OPTIONAL,
    RECOVERY_MODE_REQUIRED,
    apply_manufacturing_recovery_to_line,
    build_bom_expected_rows,
    line_allows_disassemble_change,
    product_qualifies_for_manufacturing_recovery,
    recovery_mode_from_settings,
    saleable_fg_qty_for_receipt,
    validate_intake_split,
    validate_recovery_matrix,
)
from backend.services.rmz_return_receipt_service import _any_planned_lines, _planned_stock_counts_for_line


class _Line:
    def __init__(self, **kwargs):
        self.component_recoveries = []
        for k, v in kwargs.items():
            setattr(self, k, v)


class _CompLine:
    def __init__(self, id, component_product_id, quantity, sort_order=0):
        self.id = id
        self.component_product_id = component_product_id
        self.quantity = quantity
        self.sort_order = sort_order


class _Composition:
    def __init__(self, id=1, name="BOM", lines=None):
        self.id = id
        self.name = name
        self.lines = lines or []


class TestRecoveryModeSettings(unittest.TestCase):
    def test_01_off_default(self) -> None:
        self.assertEqual(recovery_mode_from_settings(None), RECOVERY_MODE_OFF)
        s = SimpleNamespace(manufactured_component_recovery_mode="OFF")
        self.assertEqual(recovery_mode_from_settings(s), RECOVERY_MODE_OFF)


class TestBomExpected(unittest.TestCase):
    def test_05_bom_component_qty_gt_1(self) -> None:
        """Case 5: BOM component qty > 1 → expected = qty × disassembly."""
        comp = _Composition(
            lines=[
                _CompLine(10, 100, 1.0, 0),
                _CompLine(11, 101, 4.0, 1),
            ]
        )
        rows = build_bom_expected_rows(comp, 2)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["expected_qty"], 2.0)
        self.assertEqual(rows[1]["expected_qty"], 8.0)

    def test_no_waste_formula(self) -> None:
        """expected_qty ignores waste — only composition_line.quantity × disassembly_qty."""
        cl = _CompLine(1, 50, 2.0)
        cl.waste_percent = 50.0  # must be ignored
        rows = build_bom_expected_rows(_Composition(lines=[cl]), 3)
        self.assertEqual(rows[0]["expected_qty"], 6.0)


class TestRecoveryMatrix(unittest.TestCase):
    def test_06_accepted_plus_scrap_equals_expected(self) -> None:
        validate_recovery_matrix([{"expected_qty": 8, "accepted_qty": 7, "scrap_qty": 1}])

    def test_07_unbalanced_blocked(self) -> None:
        with self.assertRaises(RmzFinalizeError):
            validate_recovery_matrix([{"expected_qty": 8, "accepted_qty": 7, "scrap_qty": 0}])


class TestIntakeSplit(unittest.TestCase):
    def test_04_split_fg_and_disassemble(self) -> None:
        """Case 4: qty 3 → FG=1 DISASSEMBLE=2 (stock_intake_mode=MIXED)."""
        from backend.services.returns.manufactured_component_recovery_service import INTAKE_MIXED

        validate_intake_split(3, 1, 2, INTAKE_MIXED)

    def test_split_exceeds_physical(self) -> None:
        with self.assertRaises(RmzFinalizeError):
            validate_intake_split(3, 2, 2, INTAKE_DISASSEMBLE)

    def test_02_fg_mode_rejects_disassembly(self) -> None:
        with self.assertRaises(RmzFinalizeError):
            validate_intake_split(3, 3, 1, INTAKE_FG)


class TestBundlePrecedence(unittest.TestCase):
    def test_17_bundle_not_eligible(self) -> None:
        """Case 17: bundle flow takes precedence — not manufacturing-eligible."""
        db = MagicMock()
        self.assertFalse(
            product_qualifies_for_manufacturing_recovery(db, 1, 99, is_bundle_line=True)
        )
        db.query.assert_not_called()

    @patch(
        "backend.services.returns.manufactured_component_recovery_service.get_active_manufacturing_composition"
    )
    def test_qualifies_with_bom(self, mock_bom) -> None:
        mock_bom.return_value = _Composition()
        db = MagicMock()
        self.assertTrue(
            product_qualifies_for_manufacturing_recovery(db, 1, 99, is_bundle_line=False)
        )


class TestSaleableFgQty(unittest.TestCase):
    def test_01_off_uses_accepted(self) -> None:
        ln = _Line(accepted_qty=5, stock_intake_mode=None, fg_intake_qty=None, disassembly_qty=None)
        self.assertEqual(saleable_fg_qty_for_receipt(ln), 5)

    def test_02_optional_fg(self) -> None:
        ln = _Line(accepted_qty=5, stock_intake_mode=INTAKE_FG, fg_intake_qty=5, disassembly_qty=0)
        self.assertEqual(saleable_fg_qty_for_receipt(ln), 5)

    def test_03_disassemble_no_fg_on_z_pz(self) -> None:
        ln = _Line(accepted_qty=5, stock_intake_mode=INTAKE_DISASSEMBLE, fg_intake_qty=0, disassembly_qty=5)
        self.assertEqual(saleable_fg_qty_for_receipt(ln), 0)

    def test_04_split_uses_fg_intake(self) -> None:
        ln = _Line(accepted_qty=3, stock_intake_mode=INTAKE_DISASSEMBLE, fg_intake_qty=1, disassembly_qty=2)
        self.assertEqual(saleable_fg_qty_for_receipt(ln), 1)


class TestCommercialRejectedIndependent(unittest.TestCase):
    def test_15_rejected_still_plans_components(self) -> None:
        """Case 15: commercial REJECTED does not block physical recovery posting."""
        rec = SimpleNamespace(posted_at=None, accepted_qty=4.0)
        ln = _Line(
            accepted_qty=0,
            rejected_qty=2,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type="reject:product_used",
            decision="REJECTED",
            damage_entries_json=None,
            id=1,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=2,
            component_recoveries=[rec],
        )
        self.assertEqual(saleable_fg_qty_for_receipt(ln), 0)
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]


class TestLineAllowsDisassemble(unittest.TestCase):
    def test_16_fg_posted_blocks(self) -> None:
        """Case 16: FG already on Z-PZ → later disassemble blocked."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = (1,)
        ln = _Line(rmz_id=10, product_id=50)
        self.assertFalse(line_allows_disassemble_change(db, ln))

    def test_allows_when_no_fg_posting(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        ln = _Line(rmz_id=10, product_id=50)
        self.assertTrue(line_allows_disassemble_change(db, ln))
        self.assertEqual(LOCKED_FG_POSTED[:20], "Produkt został już p")


class TestApplyRecovery(unittest.TestCase):
    @patch(
        "backend.services.returns.manufactured_component_recovery_service.get_active_manufacturing_composition"
    )
    def test_09_required_blocks_fg_only(self, mock_bom) -> None:
        """Case 9: REQUIRED + BOM → cannot skip disassemble."""
        mock_bom.return_value = _Composition(lines=[_CompLine(1, 10, 1.0)])
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        db.query.return_value.filter.return_value.first.return_value = None
        settings = SimpleNamespace(
            manufactured_component_recovery_mode=RECOVERY_MODE_REQUIRED,
            manufactured_recovery_receipt_mode="STANDARD_PUTAWAY",
        )
        ln = _Line(id=1, product_id=9, quantity=2, accepted_qty=2, rmz_id=1)
        with self.assertRaises(RmzFinalizeError):
            apply_manufacturing_recovery_to_line(
                db,
                tenant_id=1,
                rmz_line=ln,
                settings=settings,
                is_bundle_line=False,
                stock_intake_mode=INTAKE_FG,
                fg_intake_qty=2,
                disassembly_qty=0,
                component_recoveries=None,
                require_decision=True,
            )

    @patch(
        "backend.services.returns.manufactured_component_recovery_service.get_active_manufacturing_composition"
    )
    def test_10_required_without_bom_is_noop(self, mock_bom) -> None:
        """Case 10: REQUIRED + no BOM → standard flow (not eligible)."""
        mock_bom.return_value = None
        db = MagicMock()
        settings = SimpleNamespace(manufactured_component_recovery_mode=RECOVERY_MODE_REQUIRED)
        ln = _Line(id=1, product_id=9, quantity=2, accepted_qty=2, rmz_id=1, stock_intake_mode=None)
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln,
            settings=settings,
            is_bundle_line=False,
            stock_intake_mode=None,
            fg_intake_qty=None,
            disassembly_qty=None,
            component_recoveries=None,
            require_decision=True,
        )
        self.assertIsNone(ln.stock_intake_mode)

    @patch(
        "backend.services.returns.manufactured_component_recovery_service.audit_component_scrap"
    )
    @patch(
        "backend.services.returns.manufactured_component_recovery_service.upsert_component_recoveries"
    )
    @patch(
        "backend.services.returns.manufactured_component_recovery_service.line_allows_disassemble_change",
        return_value=True,
    )
    @patch(
        "backend.services.returns.manufactured_component_recovery_service.get_active_manufacturing_composition"
    )
    def test_08_all_scrap_matrix_ok(self, mock_bom, _lock, mock_upsert, mock_audit) -> None:
        """Case 8: all scrap → matrix valid; receipt will skip Z-PZ component lines."""
        mock_bom.return_value = _Composition(lines=[_CompLine(1, 10, 2.0)])
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        settings = SimpleNamespace(manufactured_component_recovery_mode=RECOVERY_MODE_OPTIONAL)
        ln = _Line(id=1, product_id=9, quantity=1, accepted_qty=0, rmz_id=1)
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln,
            settings=settings,
            is_bundle_line=False,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
            component_recoveries=[
                {"composition_line_id": 1, "accepted_qty": 0, "scrap_qty": 2},
            ],
            require_decision=True,
        )
        self.assertEqual(ln.disassembly_qty, 1)
        mock_upsert.assert_called_once()
        args = mock_upsert.call_args[0]
        rows = args[3]
        self.assertEqual(rows[0]["accepted_qty"], 0)
        self.assertEqual(rows[0]["scrap_qty"], 2)
        self.assertEqual(rows[0]["expected_qty"], 2.0)

    @patch(
        "backend.services.returns.manufactured_component_recovery_service.upsert_component_recoveries"
    )
    @patch(
        "backend.services.returns.manufactured_component_recovery_service.line_allows_disassemble_change",
        return_value=True,
    )
    @patch(
        "backend.services.returns.manufactured_component_recovery_service.get_active_manufacturing_composition"
    )
    def test_14_snapshot_keeps_historical_expected(self, mock_bom, _lock, mock_upsert) -> None:
        """Case 14: client expected override ignored — snapshot from BOM × disassembly."""
        mock_bom.return_value = _Composition(lines=[_CompLine(1, 10, 3.0)])
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        settings = SimpleNamespace(manufactured_component_recovery_mode=RECOVERY_MODE_OPTIONAL)
        ln = _Line(id=1, product_id=9, quantity=2, accepted_qty=0, rmz_id=1)
        apply_manufacturing_recovery_to_line(
            db,
            tenant_id=1,
            rmz_line=ln,
            settings=settings,
            is_bundle_line=False,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=2,
            component_recoveries=[
                {
                    "composition_line_id": 1,
                    "accepted_qty": 6,
                    "scrap_qty": 0,
                    "expected_qty": 999,  # must be ignored
                },
            ],
            require_decision=True,
        )
        rows = mock_upsert.call_args[0][3]
        self.assertEqual(rows[0]["expected_qty"], 6.0)


class TestReceiptHelpers(unittest.TestCase):
    def test_03_disassemble_planned_via_recoveries(self) -> None:
        rec = SimpleNamespace(posted_at=None, accepted_qty=2.0)
        ln = _Line(
            accepted_qty=0,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type=None,
            decision="OK",
            damage_entries_json=None,
            id=1,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
            component_recoveries=[rec],
        )
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_legacy_accepted_still_planned(self) -> None:
        ln = _Line(
            accepted_qty=2,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type=None,
            decision="OK",
            damage_entries_json=None,
            id=1,
            stock_intake_mode=None,
            fg_intake_qty=None,
            disassembly_qty=None,
            component_recoveries=[],
        )
        aq, dmg, _ = _planned_stock_counts_for_line(None, 1, 1, ln)  # type: ignore[arg-type]
        self.assertEqual(aq, 2)
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]


class TestUpsertPostedGuard(unittest.TestCase):
    def test_13_idempotent_posted_block(self) -> None:
        from backend.services.returns.manufactured_component_recovery_service import (
            upsert_component_recoveries,
        )

        db = MagicMock()
        existing = SimpleNamespace(posted_at=datetime.utcnow())
        db.query.return_value.filter.return_value.all.return_value = [existing]
        ln = _Line(id=1)
        with self.assertRaises(RmzFinalizeError):
            upsert_component_recoveries(
                db,
                ln,
                _Composition(),
                [{"composition_line_id": 1, "component_product_id": 2, "expected_qty": 1}],
                tenant_id=1,
            )


if __name__ == "__main__":
    unittest.main()
