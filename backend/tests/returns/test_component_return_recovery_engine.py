"""Golden + engine tests: shared component return recovery → Z-PZ emission.

Locks bundle + manufacturing stock semantics without merging ORM models.
"""

from __future__ import annotations

import unittest
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY
from backend.services.bundles.bundle_rmz_receipt_integration import RmzReceiptStockRow
from backend.services.bundles.bundle_return_service import (
    BundleComponentReturnIn,
    classify_bundle_return_scenario,
    component_refund_amount,
)
from backend.services.returns.component_return_recovery_contract import (
    SOURCE_BUNDLE,
    SOURCE_MANUFACTURING,
    ComponentReturnRecoveryLine,
)
from backend.services.returns.component_return_recovery_service import (
    adapt_bundle_receipt_rows_to_recovery_lines,
    adapt_manufacturing_recoveries_to_recovery_lines,
    append_accepted_component_lines,
    mark_manufacturing_recoveries_posted,
)
from backend.services.returns.manufactured_component_recovery_service import (
    product_qualifies_for_manufacturing_recovery,
    validate_recovery_matrix,
)
from backend.services.returns.z_pz_constants import DISPOSITION_SALEABLE
from backend.tests.test_bundle_returns_complaints import _comp_node


class TestBundleGoldenRefundAndScenario(unittest.TestCase):
    def test_full_recovery_scenario(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=40), _comp_node(sid=2, sold=1, price=20)]
        sel = [
            BundleComponentReturnIn(snapshot_id=1, returned_qty=2, accepted_qty=2),
            BundleComponentReturnIn(snapshot_id=2, returned_qty=1, accepted_qty=1),
        ]
        self.assertEqual(
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=sel,
                expected_components=expected,
            ),
            "FULL_BUNDLE",
        )

    def test_partial_and_single_component(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=40), _comp_node(sid=2, sold=1, price=20)]
        partial = [
            BundleComponentReturnIn(snapshot_id=1, returned_qty=1, accepted_qty=1),
            BundleComponentReturnIn(snapshot_id=2, returned_qty=1, accepted_qty=1),
        ]
        self.assertEqual(
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=partial,
                expected_components=expected,
            ),
            "PARTIAL_BUNDLE",
        )
        single = [BundleComponentReturnIn(snapshot_id=2, returned_qty=1, accepted_qty=1)]
        self.assertEqual(
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=single,
                expected_components=expected,
            ),
            "INCOMPLETE",
        )

    def test_refund_snapshot_price_unchanged(self) -> None:
        self.assertEqual(component_refund_amount(unit_price_snapshot=20.0, accepted_qty=1), 20.0)
        self.assertEqual(component_refund_amount(unit_price_snapshot=40.0, accepted_qty=2), 80.0)


class TestBundleAdapter(unittest.TestCase):
    def test_full_accepted_maps_to_dto(self) -> None:
        db = MagicMock()
        ln = SimpleNamespace(id=10, product_id=99, order_item_id=50)
        cr = SimpleNamespace(
            id=7,
            order_line_bundle_component_id=1,
            returned_qty=2,
            accepted_qty=2,
        )
        with patch(
            "backend.services.returns.component_return_recovery_service.bundle_component_returns_for_line",
            return_value=[cr],
        ):
            rows = [
                RmzReceiptStockRow(101, 2.0, 50, 40.0, 1, "component"),
            ]
            lines = adapt_bundle_receipt_rows_to_recovery_lines(
                db, ln, rows, vat_rate_by_order_item=lambda _oid: (None, 23.0)
            )
        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0].source_type, SOURCE_BUNDLE)
        self.assertEqual(lines[0].component_product_id, 101)
        self.assertEqual(lines[0].accepted_qty, 2.0)
        self.assertEqual(lines[0].expected_qty, 2.0)
        self.assertEqual(lines[0].scrap_qty, 0.0)
        self.assertEqual(lines[0].purchase_price_net, 40.0)
        self.assertIsNone(lines[0].target_location_id)

    def test_partial_accepted_computes_scrap_without_stock_change(self) -> None:
        db = MagicMock()
        ln = SimpleNamespace(id=10, product_id=99, order_item_id=50)
        cr = SimpleNamespace(
            id=8,
            order_line_bundle_component_id=1,
            returned_qty=2,
            accepted_qty=1,
        )
        with patch(
            "backend.services.returns.component_return_recovery_service.bundle_component_returns_for_line",
            return_value=[cr],
        ):
            rows = [RmzReceiptStockRow(101, 1.0, 50, 40.0, 1, "component")]
            lines = adapt_bundle_receipt_rows_to_recovery_lines(
                db, ln, rows, vat_rate_by_order_item=lambda _oid: (None, 23.0)
            )
        self.assertEqual(lines[0].accepted_qty, 1.0)
        self.assertEqual(lines[0].scrap_qty, 1.0)
        self.assertEqual(lines[0].expected_qty, 2.0)


class TestManufacturingAdapter(unittest.TestCase):
    def test_partial_accepted_scrap_and_default_location(self) -> None:
        rec = SimpleNamespace(
            id=5,
            component_product_id=192,
            expected_qty=2.0,
            accepted_qty=1.0,
            scrap_qty=1.0,
            composition_id=9,
            composition_line_id=5,
            posted_at=None,
            stock_document_item_id=None,
        )
        emit, scrap_only = adapt_manufacturing_recoveries_to_recovery_lines(
            [rec], target_location_id=77
        )
        self.assertEqual(len(emit), 1)
        self.assertEqual(len(scrap_only), 0)
        self.assertEqual(emit[0].source_type, SOURCE_MANUFACTURING)
        self.assertEqual(emit[0].accepted_qty, 1.0)
        self.assertEqual(emit[0].scrap_qty, 1.0)
        self.assertEqual(emit[0].target_location_id, 77)
        self.assertEqual(emit[0].rmz_damage_entry_id, "mfg-rec-5")
        validate_recovery_matrix(
            [{"expected_qty": 2, "accepted_qty": 1, "scrap_qty": 1}]
        )

    def test_scrap_only_no_emit(self) -> None:
        rec = SimpleNamespace(
            id=6,
            component_product_id=192,
            expected_qty=2.0,
            accepted_qty=0.0,
            scrap_qty=2.0,
            composition_id=9,
            composition_line_id=5,
            posted_at=None,
            stock_document_item_id=None,
        )
        emit, scrap_only = adapt_manufacturing_recoveries_to_recovery_lines([rec])
        self.assertEqual(emit, [])
        self.assertEqual(scrap_only, [rec])

    def test_skips_already_posted(self) -> None:
        rec = SimpleNamespace(
            id=6,
            component_product_id=192,
            expected_qty=2.0,
            accepted_qty=2.0,
            scrap_qty=0.0,
            composition_id=9,
            composition_line_id=5,
            posted_at=datetime.utcnow(),
            stock_document_item_id=99,
        )
        emit, scrap_only = adapt_manufacturing_recoveries_to_recovery_lines([rec])
        self.assertEqual(emit, [])
        self.assertEqual(scrap_only, [])


class TestSharedAppend(unittest.TestCase):
    def test_emits_only_accepted_gt_zero(self) -> None:
        created_items: list = []

        def add_line(**kwargs):
            row = SimpleNamespace(id=100 + len(created_items), **kwargs)
            created_items.append(row)
            return row

        lines = [
            ComponentReturnRecoveryLine(
                component_product_id=1,
                expected_qty=2,
                accepted_qty=0,
                scrap_qty=2,
                source_type=SOURCE_MANUFACTURING,
            ),
            ComponentReturnRecoveryLine(
                component_product_id=2,
                expected_qty=2,
                accepted_qty=1,
                scrap_qty=1,
                source_type=SOURCE_MANUFACTURING,
                rmz_damage_entry_id="mfg-rec-1",
                target_location_id=12,
            ),
            ComponentReturnRecoveryLine(
                component_product_id=3,
                expected_qty=1,
                accepted_qty=1,
                scrap_qty=0,
                source_type=SOURCE_BUNDLE,
                purchase_price_net=10.0,
                vat_rate=23.0,
            ),
        ]
        out = append_accepted_component_lines(lines=lines, add_line=add_line)
        self.assertEqual(len(out), 2)
        self.assertEqual(created_items[0].product_id, 2)
        self.assertEqual(created_items[0].qty, 1.0)
        self.assertEqual(created_items[0].direct_location_id, 12)
        self.assertEqual(created_items[0].disposition, DISPOSITION_SALEABLE)
        self.assertEqual(created_items[1].product_id, 3)
        self.assertEqual(created_items[1].purchase_price_net, 10.0)

    def test_equivalent_fixture_same_stock_fields(self) -> None:
        """Shared helper produces identical StockDocumentItem kwargs for equivalent DTO."""
        captured: list[dict] = []

        def add_line(**kwargs):
            captured.append(dict(kwargs))
            return SimpleNamespace(id=1, **kwargs)

        bundle = ComponentReturnRecoveryLine(
            component_product_id=192,
            expected_qty=1,
            accepted_qty=1,
            scrap_qty=0,
            source_type=SOURCE_BUNDLE,
            disposition=DISPOSITION_SALEABLE,
            return_decision="ACCEPTED",
            purchase_price_net=None,
            vat_rate=23.0,
            rmz_damage_entry_id=None,
            target_location_id=None,
        )
        mfg = ComponentReturnRecoveryLine(
            component_product_id=192,
            expected_qty=1,
            accepted_qty=1,
            scrap_qty=0,
            source_type=SOURCE_MANUFACTURING,
            disposition=DISPOSITION_SALEABLE,
            return_decision="ACCEPTED",
            purchase_price_net=None,
            vat_rate=23.0,
            rmz_damage_entry_id="mfg-rec-9",
            target_location_id=None,
        )
        append_accepted_component_lines(lines=[bundle], add_line=add_line)
        append_accepted_component_lines(lines=[mfg], add_line=add_line)
        keys = (
            "product_id",
            "qty",
            "disposition",
            "return_decision",
            "purchase_price_net",
            "vat_rate",
            "direct_location_id",
        )
        b = {k: captured[0][k] for k in keys}
        m = {k: captured[1][k] for k in keys}
        # stock-critical fields identical; damage entry id may differ by source
        for k in ("product_id", "qty", "disposition", "return_decision", "purchase_price_net", "vat_rate", "direct_location_id"):
            self.assertEqual(b[k], m[k], msg=k)

    def test_mark_posted_links_sdi_and_scrap_only(self) -> None:
        rec_stock = SimpleNamespace(id=1, posted_at=None, stock_document_item_id=None, updated_at=None)
        rec_scrap = SimpleNamespace(id=2, posted_at=None, stock_document_item_id=None, updated_at=None)
        line = ComponentReturnRecoveryLine(
            component_product_id=192,
            expected_qty=2,
            accepted_qty=1,
            scrap_qty=1,
            source_type=SOURCE_MANUFACTURING,
            source_row_id=1,
        )
        sdi = SimpleNamespace(id=167)
        mark_manufacturing_recoveries_posted(
            created=[(line, sdi)],
            scrap_only=[rec_scrap],
            recoveries_by_id={1: rec_stock, 2: rec_scrap},
            now=datetime(2026, 8, 14, 12, 0, 0),
        )
        self.assertEqual(rec_stock.stock_document_item_id, 167)
        self.assertIsNotNone(rec_stock.posted_at)
        self.assertIsNotNone(rec_scrap.posted_at)
        self.assertIsNone(rec_scrap.stock_document_item_id)


class TestBundlePrecedence(unittest.TestCase):
    def test_bundle_line_blocks_manufacturing_eligibility(self) -> None:
        db = MagicMock()
        self.assertFalse(
            product_qualifies_for_manufacturing_recovery(db, 1, 99, is_bundle_line=True)
        )
        db.query.assert_not_called()


class TestIdempotentAppendRetry(unittest.TestCase):
    def test_second_pass_skips_posted_manufacturing_rows(self) -> None:
        rec = SimpleNamespace(
            id=1,
            component_product_id=192,
            expected_qty=1.0,
            accepted_qty=1.0,
            scrap_qty=0.0,
            composition_id=1,
            composition_line_id=1,
            posted_at=datetime.utcnow(),
            stock_document_item_id=50,
        )
        emit, scrap_only = adapt_manufacturing_recoveries_to_recovery_lines([rec])
        self.assertEqual(emit, [])
        calls: list = []

        def add_line(**kwargs):
            calls.append(kwargs)
            return SimpleNamespace(id=99)

        append_accepted_component_lines(lines=emit, add_line=add_line)
        self.assertEqual(calls, [])


if __name__ == "__main__":
    unittest.main()
