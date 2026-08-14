"""Regression: STOCK bundle DISASSEMBLE must emit Z-PZ for accepted components (UAT blocker)."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.bundle_operational_mode import STOCK_PRODUCTION
from backend.services.bundles.bundle_return_service import line_has_pending_bundle_component_receipt
from backend.services.returns.errors import RmzFinalizeError
from backend.services.returns.manufactured_component_recovery_service import (
    INTAKE_DISASSEMBLE,
    INTAKE_MIXED,
)
from backend.services.rmz_return_receipt_service import (
    _any_planned_lines,
    assert_rmz_stock_receipt_satisfied,
    ensure_required_rmz_return_receipt_document,
)


class _Line:
    def __init__(self, **kwargs):
        self.bundle_component_returns = kwargs.pop("bundle_component_returns", [])
        self.component_recoveries = kwargs.pop("component_recoveries", [])
        for k, v in kwargs.items():
            setattr(self, k, v)


class TestAnyPlannedLinesBundleDisassemble(unittest.TestCase):
    """A/C: gate must see accepted bundle components even when FG=0."""

    def test_a_disassemble_fg0_accepted_component_plans_receipt(self) -> None:
        ln = _Line(
            id=39,
            product_id=354,
            order_item_id=1249,
            accepted_qty=1,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type=None,
            decision="OK",
            damage_entries_json=None,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
            bundle_component_returns=[
                SimpleNamespace(accepted_qty=0, returned_qty=1),
                SimpleNamespace(accepted_qty=1, returned_qty=1),
            ],
        )
        self.assertTrue(line_has_pending_bundle_component_receipt(None, ln))  # type: ignore[arg-type]
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_c_all_scrap_does_not_plan_receipt(self) -> None:
        ln = _Line(
            id=39,
            product_id=354,
            order_item_id=1249,
            accepted_qty=0,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type=None,
            decision="OK",
            damage_entries_json=None,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
            bundle_component_returns=[
                SimpleNamespace(accepted_qty=0, returned_qty=1),
                SimpleNamespace(accepted_qty=0, returned_qty=1),
            ],
        )
        self.assertFalse(line_has_pending_bundle_component_receipt(None, ln))  # type: ignore[arg-type]
        self.assertFalse(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]

    def test_b_mixed_fg_and_components_plans_receipt(self) -> None:
        ln = _Line(
            id=40,
            product_id=354,
            order_item_id=50,
            accepted_qty=2,
            rejected_qty=0,
            damaged_b_qty=0,
            damaged_c_qty=0,
            damage_type=None,
            decision="OK",
            damage_entries_json=None,
            stock_intake_mode=INTAKE_MIXED,
            fg_intake_qty=1,
            disassembly_qty=1,
            bundle_component_returns=[
                SimpleNamespace(accepted_qty=1, returned_qty=1),
            ],
        )
        self.assertTrue(_any_planned_lines(None, 1, 1, [ln]))  # type: ignore[arg-type]


class TestEnsureRequiredReceipt(unittest.TestCase):
    """A/E: ensure creates when planned; D: fail when required missing; E: idempotent ok."""

    @patch("backend.services.rmz_return_receipt_service.ensure_rmz_return_receipt_document")
    @patch("backend.services.rmz_return_receipt_service._any_planned_lines", return_value=True)
    @patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted", return_value=True)
    def test_a_ensure_required_returns_doc_when_posted(
        self, _posted, _planned, mock_ensure
    ) -> None:
        db = MagicMock()
        rmz = MagicMock()
        rmz.id = 32
        rmz.tenant_id = 1
        rmz.warehouse_id = 1
        doc = MagicMock()
        doc.id = 900
        mock_ensure.return_value = doc
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [MagicMock()]

        out = ensure_required_rmz_return_receipt_document(db, rmz)
        self.assertIs(out, doc)

    @patch("backend.services.rmz_return_receipt_service.ensure_rmz_return_receipt_document")
    @patch("backend.services.rmz_return_receipt_service._any_planned_lines", return_value=True)
    def test_d_ensure_required_fails_when_doc_missing(self, _planned, mock_ensure) -> None:
        db = MagicMock()
        rmz = MagicMock()
        rmz.id = 32
        rmz.tenant_id = 1
        rmz.warehouse_id = 1
        mock_ensure.return_value = None
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [MagicMock()]

        with self.assertRaises(ValueError) as ctx:
            ensure_required_rmz_return_receipt_document(db, rmz)
        self.assertIn("Z-PZ", str(ctx.exception))

    @patch("backend.services.rmz_return_receipt_service._any_planned_lines", return_value=False)
    def test_c_all_scrap_allows_none_document(self, _planned) -> None:
        db = MagicMock()
        rmz = MagicMock()
        rmz.id = 32
        rmz.tenant_id = 1
        rmz.warehouse_id = 1
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [MagicMock()]
        assert_rmz_stock_receipt_satisfied(db, rmz, None)

    @patch("backend.services.rmz_return_receipt_service.ensure_rmz_return_receipt_document")
    @patch("backend.services.rmz_return_receipt_service._any_planned_lines", return_value=True)
    @patch("backend.services.rmz_return_receipt_service._rmz_lines_already_posted", return_value=True)
    def test_e_idempotent_reensure_ok(self, _posted, _planned, mock_ensure) -> None:
        db = MagicMock()
        rmz = MagicMock()
        rmz.id = 32
        rmz.tenant_id = 1
        rmz.warehouse_id = 1
        doc = MagicMock()
        doc.id = 900
        mock_ensure.return_value = doc
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [MagicMock()]

        a = ensure_required_rmz_return_receipt_document(db, rmz)
        b = ensure_required_rmz_return_receipt_document(db, rmz)
        self.assertIs(a, doc)
        self.assertIs(b, doc)
        self.assertEqual(mock_ensure.call_count, 2)


class TestFinalizeFailsWithoutRequiredZpZ(unittest.TestCase):
    """D: finalize must not mark RMZ done when required Z-PZ missing."""

    @patch("backend.services.returns.rmz_finalize_service.ensure_required_rmz_return_receipt_document")
    @patch("backend.services.returns.rmz_finalize_service.apply_rmz_line_split")
    @patch("backend.services.returns.rmz_finalize_service.validate_rmz_lines_ready_for_finalize")
    def test_d_finalize_raises_and_skips_transition(
        self, _validate, _apply, mock_ensure
    ) -> None:
        from backend.schemas.wms_return import WmsReturnFinalizeLineIn
        from backend.services.returns.rmz_finalize_service import finalize_rmz_return

        db = MagicMock()
        row = MagicMock()
        row.id = 32
        row.tenant_id = 1
        row.warehouse_id = 1
        row.return_type = "RMA"
        row.warehouse_document_id = None
        row.return_status = None

        settings = MagicMock()
        settings.returns_mode = "simple"
        settings.require_photos = False
        settings.enable_refund = False

        ln = MagicMock()
        ln.order_item_id = 10
        ln.rmz_id = 32
        db.query.return_value.filter.return_value.all.return_value = [ln]

        mock_ensure.side_effect = RmzFinalizeError("Nie utworzono wymaganego dokumentu Z-PZ")

        with self.assertRaises(RmzFinalizeError):
            finalize_rmz_return(
                db,
                row,
                line_payloads=[
                    WmsReturnFinalizeLineIn(
                        order_item_id=10,
                        product_id=354,
                        accepted_qty=1,
                        damaged_qty=0,
                        damaged_b_qty=0,
                        damaged_c_qty=0,
                        rejected_qty=0,
                    )
                ],
                settings=settings,
            )


class TestAppendPathDisassembleOnlyComponent(unittest.TestCase):
    """A: append emits only accepted component B (not FG SKU, not scrap A)."""

    def test_a_bundle_adapter_emits_single_accepted_component(self) -> None:
        from backend.services.bundles.bundle_rmz_receipt_integration import (
            RmzReceiptStockRow,
            effective_receipt_rows_for_rmz_line,
        )
        from backend.services.returns.component_return_recovery_service import (
            adapt_bundle_receipt_rows_to_recovery_lines,
            append_accepted_component_lines,
            bundle_component_recovery_lines_for_rmz_line,
        )

        db = MagicMock()
        ln = SimpleNamespace(
            id=39,
            product_id=354,
            order_item_id=1249,
            accepted_qty=1,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
        )
        crs = [
            SimpleNamespace(id=1, order_line_bundle_component_id=1, accepted_qty=0, returned_qty=1),
            SimpleNamespace(id=2, order_line_bundle_component_id=2, accepted_qty=1, returned_qty=1),
        ]
        ctx = SimpleNamespace(
            fulfillment_mode=STOCK_PRODUCTION,
            linked_product_id=354,
            parent_order_item=SimpleNamespace(product_id=354),
            pricing=SimpleNamespace(commercial_unit_price_net=10.0),
            bundle_qty=1,
        )
        snaps = [
            SimpleNamespace(
                snapshot_id=1,
                component_product_id=101,
                unit_price_snapshot=1.0,
                unit_cost_snapshot=1.0,
            ),
            SimpleNamespace(
                snapshot_id=2,
                component_product_id=102,
                unit_price_snapshot=2.0,
                unit_cost_snapshot=2.0,
            ),
        ]
        with (
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.is_bundle_parent_rmz_line",
                return_value=True,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.bundle_line_resolver.resolve_parent_line",
                return_value=ctx,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.bundle_component_returns_for_line",
                return_value=crs,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.stock_can_disassemble",
                return_value=True,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.stock_snapshot_components",
                return_value=snaps,
            ),
            patch(
                "backend.services.returns.component_return_recovery_service.bundle_component_returns_for_line",
                return_value=crs,
            ),
        ):
            rows = effective_receipt_rows_for_rmz_line(db, ln)  # type: ignore[arg-type]
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0].product_id, 102)
            self.assertEqual(rows[0].quantity, 1.0)
            self.assertEqual(rows[0].line_role, "component")

            lines = bundle_component_recovery_lines_for_rmz_line(
                db, ln, vat_rate_by_order_item=lambda _oid: (2.0, 23.0)  # type: ignore[arg-type]
            )
            self.assertEqual(len(lines), 1)
            self.assertEqual(lines[0].component_product_id, 102)
            self.assertEqual(lines[0].accepted_qty, 1.0)

            created: list = []
            append_accepted_component_lines(
                lines=lines,
                add_line=lambda **kw: created.append(kw) or SimpleNamespace(id=1),
            )
            self.assertEqual(len(created), 1)
            self.assertEqual(created[0]["product_id"], 102)
            self.assertEqual(created[0]["qty"], 1.0)

    def test_b_mixed_receipt_rows_fg_plus_component(self) -> None:
        from backend.services.bundles.bundle_rmz_receipt_integration import (
            effective_receipt_rows_for_rmz_line,
        )

        db = MagicMock()
        ln = SimpleNamespace(
            id=40,
            product_id=354,
            order_item_id=50,
            accepted_qty=2,
            stock_intake_mode=INTAKE_MIXED,
            fg_intake_qty=1,
            disassembly_qty=1,
        )
        crs = [
            SimpleNamespace(id=1, order_line_bundle_component_id=1, accepted_qty=1, returned_qty=1),
        ]
        ctx = SimpleNamespace(
            fulfillment_mode=STOCK_PRODUCTION,
            linked_product_id=354,
            parent_order_item=SimpleNamespace(product_id=354),
            pricing=SimpleNamespace(commercial_unit_price_net=55.0),
            bundle_qty=2,
        )
        snaps = [
            SimpleNamespace(
                snapshot_id=1,
                component_product_id=101,
                unit_price_snapshot=1.0,
                unit_cost_snapshot=1.0,
            ),
        ]
        with (
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.is_bundle_parent_rmz_line",
                return_value=True,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.bundle_line_resolver.resolve_parent_line",
                return_value=ctx,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.bundle_component_returns_for_line",
                return_value=crs,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.stock_can_disassemble",
                return_value=True,
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.stock_snapshot_components",
                return_value=snaps,
            ),
        ):
            rows = effective_receipt_rows_for_rmz_line(db, ln)  # type: ignore[arg-type]
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0].line_role, "stock_sku")
        self.assertEqual(rows[0].product_id, 354)
        self.assertEqual(rows[0].quantity, 1.0)
        self.assertEqual(rows[1].product_id, 101)
        self.assertEqual(rows[1].quantity, 1.0)


if __name__ == "__main__":
    unittest.main()
