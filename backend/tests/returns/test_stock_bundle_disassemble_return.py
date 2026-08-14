"""STOCK bundle return intake: FG vs disassemble from snapshot."""

from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundles.bundle_line_context import (
    BundleComponentSnapshotView,
    BundleLineContext,
    BundlePricingContext,
)
from backend.services.bundles.bundle_line_projections import return_lines
from backend.services.bundles.bundle_rmz_receipt_integration import (
    RmzReceiptStockRow,
    effective_receipt_rows_for_rmz_line,
)
from backend.services.bundles.bundle_return_service import BundleComponentReturnIn
from backend.services.bundles.bundle_stock_return_intake import (
    expected_component_qty,
    physical_bundle_qty_for_parent,
    snapshot_nodes_for_tree,
    stock_can_disassemble,
)
from backend.services.returns.manufactured_component_recovery_service import (
    INTAKE_DISASSEMBLE,
    INTAKE_FG,
    INTAKE_MIXED,
    product_qualifies_for_manufacturing_recovery,
)
from backend.services.returns.component_return_recovery_service import (
    adapt_bundle_receipt_rows_to_recovery_lines,
    append_accepted_component_lines,
)


def _snap(sid: int, pid: int, per: int, total: int, name: str = "C") -> BundleComponentSnapshotView:
    return BundleComponentSnapshotView(
        snapshot_id=sid,
        order_id=1,
        order_line_id=50,
        bundle_id=7,
        component_product_id=pid,
        component_name=name,
        sku=f"SKU-{pid}",
        ean=None,
        required_qty_per_bundle=per,
        required_qty_total=total,
        unit_cost_snapshot=1.0,
        unit_price_snapshot=10.0,
    )


def _ctx_stock_abc(*, bundle_qty: int = 1) -> BundleLineContext:
    parent = SimpleNamespace(
        id=50,
        product_id=900,
        quantity=bundle_qty,
        unit_price=55.0,
        total_price=55.0 * bundle_qty,
        list_price=None,
        vat_percent=23.0,
        required_stock_disposition="SALEABLE",
        is_bundle_parent=True,
    )
    comps = (
        _snap(1, 101, 1, 1 * bundle_qty, "A"),
        _snap(2, 102, 2, 2 * bundle_qty, "B"),
        _snap(3, 103, 1, 1 * bundle_qty, "C"),
    )
    return BundleLineContext(
        order_id=1,
        order_line_id=50,
        parent_order_item=parent,  # type: ignore[arg-type]
        bundle_id=7,
        bundle_name="ABC Kit",
        fulfillment_mode=STOCK_PRODUCTION,
        bundle_qty=bundle_qty,
        pricing=BundlePricingContext(55.0, 55.0 * bundle_qty, None, 23.0),
        components=comps,
        linked_product_id=900,
        component_order_items=(),
    )


class TestStockReturnTree(unittest.TestCase):
    def test_return_lines_stock_still_stock_sku(self) -> None:
        lines = return_lines(_ctx_stock_abc())
        roles = [l.line_role for l in lines]
        self.assertIn("bundle_header", roles)
        self.assertIn("stock_sku", roles)
        self.assertNotIn("component", roles)

    def test_snapshot_nodes_abc(self) -> None:
        nodes = snapshot_nodes_for_tree(_ctx_stock_abc())
        self.assertEqual(len(nodes), 3)
        self.assertEqual([n.component_product_id for n in nodes], [101, 102, 103])
        self.assertEqual([n.quantity_per_bundle for n in nodes], [1, 2, 1])

    def test_can_disassemble_requires_snapshot(self) -> None:
        self.assertTrue(stock_can_disassemble(_ctx_stock_abc()))
        empty = BundleLineContext(
            order_id=1,
            order_line_id=50,
            parent_order_item=_ctx_stock_abc().parent_order_item,
            bundle_id=7,
            bundle_name="X",
            fulfillment_mode=STOCK_PRODUCTION,
            bundle_qty=1,
            pricing=BundlePricingContext(1.0, 1.0, None, 23.0),
            components=(),
            linked_product_id=900,
            component_order_items=(),
        )
        self.assertFalse(stock_can_disassemble(empty))

    def test_expected_scales_with_disassembly(self) -> None:
        self.assertEqual(expected_component_qty(per_bundle=2, disassembly_qty=2), 4)
        self.assertEqual(expected_component_qty(per_bundle=1, disassembly_qty=3), 3)


class TestLegacyPhysicalQty(unittest.TestCase):
    def test_qty_zero_inferred_from_snapshot(self) -> None:
        parent = SimpleNamespace(id=50, quantity=0, is_bundle_parent=True, product_id=182)
        ctx = _ctx_stock_abc(bundle_qty=0)
        # Force components with totals implying 3 sets (B: 6/2)
        comps = (
            _snap(1, 101, 1, 3, "A"),
            _snap(2, 102, 2, 6, "B"),
            _snap(3, 103, 1, 3, "C"),
        )
        ctx = BundleLineContext(
            order_id=1,
            order_line_id=50,
            parent_order_item=parent,  # type: ignore[arg-type]
            bundle_id=7,
            bundle_name="ABC",
            fulfillment_mode=ON_DEMAND_ASSEMBLY,
            bundle_qty=0,
            pricing=BundlePricingContext(1.0, 0.0, None, 23.0),
            components=comps,
            linked_product_id=None,
            component_order_items=(),
        )
        db = MagicMock()
        with patch(
            "backend.services.bundles.bundle_stock_return_intake.bundle_line_resolver.resolve_parent_line",
            return_value=ctx,
        ):
            self.assertEqual(physical_bundle_qty_for_parent(db, parent), 3)  # type: ignore[arg-type]


class TestStockReceiptRows(unittest.TestCase):
    def test_fg_default_stock_sku(self) -> None:
        db = MagicMock()
        ln = SimpleNamespace(
            id=10,
            product_id=900,
            order_item_id=50,
            accepted_qty=1,
            stock_intake_mode=INTAKE_FG,
            fg_intake_qty=1,
            disassembly_qty=0,
        )
        ctx = _ctx_stock_abc()
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
                return_value=[],
            ),
            patch(
                "backend.services.bundles.bundle_rmz_receipt_integration.warehouse_receipt_lines",
                return_value=[
                    SimpleNamespace(
                        product_id=900,
                        quantity=1,
                        order_line_id=50,
                        unit_price_snapshot=55.0,
                        component_snapshot_id=None,
                        line_role="stock_sku",
                    )
                ],
            ),
        ):
            rows = effective_receipt_rows_for_rmz_line(db, ln)  # type: ignore[arg-type]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0].product_id, 900)
        self.assertEqual(rows[0].line_role, "stock_sku")

    def test_disassemble_emits_accepted_components_only(self) -> None:
        db = MagicMock()
        ln = SimpleNamespace(
            id=10,
            product_id=900,
            order_item_id=50,
            accepted_qty=0,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
        )
        ctx = _ctx_stock_abc()
        crs = [
            SimpleNamespace(order_line_bundle_component_id=1, accepted_qty=1, returned_qty=1, id=1),
            SimpleNamespace(order_line_bundle_component_id=2, accepted_qty=1, returned_qty=2, id=2),
            SimpleNamespace(order_line_bundle_component_id=3, accepted_qty=0, returned_qty=1, id=3),
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
        ):
            rows = effective_receipt_rows_for_rmz_line(db, ln)  # type: ignore[arg-type]
        pids = [r.product_id for r in rows]
        self.assertEqual(pids, [101, 102])
        self.assertTrue(all(r.line_role == "component" for r in rows))

    def test_mixed_fg_plus_components(self) -> None:
        db = MagicMock()
        ln = SimpleNamespace(
            id=10,
            product_id=900,
            order_item_id=50,
            accepted_qty=1,
            stock_intake_mode=INTAKE_MIXED,
            fg_intake_qty=1,
            disassembly_qty=2,
        )
        ctx = _ctx_stock_abc(bundle_qty=3)
        crs = [
            SimpleNamespace(order_line_bundle_component_id=1, accepted_qty=2, returned_qty=2, id=1),
            SimpleNamespace(order_line_bundle_component_id=2, accepted_qty=4, returned_qty=4, id=2),
            SimpleNamespace(order_line_bundle_component_id=3, accepted_qty=2, returned_qty=2, id=3),
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
        ):
            rows = effective_receipt_rows_for_rmz_line(db, ln)  # type: ignore[arg-type]
        self.assertEqual(rows[0].line_role, "stock_sku")
        self.assertEqual(rows[0].quantity, 1.0)
        self.assertEqual(len(rows), 4)

    def test_partial_b_scrap_not_emitted(self) -> None:
        """B expected2 accepted1 → only 1 on Z-PZ; scrap informational in adapter."""
        db = MagicMock()
        ln = SimpleNamespace(id=10, product_id=900, order_item_id=50)
        cr = SimpleNamespace(id=8, order_line_bundle_component_id=2, returned_qty=2, accepted_qty=1)
        with patch(
            "backend.services.returns.component_return_recovery_service.bundle_component_returns_for_line",
            return_value=[cr],
        ):
            lines = adapt_bundle_receipt_rows_to_recovery_lines(
                db,
                ln,  # type: ignore[arg-type]
                [RmzReceiptStockRow(102, 1.0, 50, 10.0, 2, "component")],
                vat_rate_by_order_item=lambda _oid: (10.0, 23.0),
            )
        self.assertEqual(lines[0].accepted_qty, 1.0)
        self.assertEqual(lines[0].scrap_qty, 1.0)
        created: list = []
        append_accepted_component_lines(
            lines=lines,
            add_line=lambda **kw: created.append(kw) or SimpleNamespace(id=1),
        )
        self.assertEqual(len(created), 1)
        self.assertEqual(created[0]["qty"], 1.0)


class TestPrecedence(unittest.TestCase):
    def test_bundle_line_blocks_manufacturing(self) -> None:
        db = MagicMock()
        self.assertFalse(
            product_qualifies_for_manufacturing_recovery(db, 1, 900, is_bundle_line=True)
        )


class TestMfgDoesNotClearBundleIntake(unittest.TestCase):
    def test_ineligible_bundle_keeps_stock_intake_mode(self) -> None:
        from backend.services.returns.manufactured_component_recovery_service import (
            apply_manufacturing_recovery_to_line,
            RECOVERY_MODE_OPTIONAL,
        )

        db = MagicMock()
        ln = SimpleNamespace(
            id=1,
            product_id=900,
            quantity=1,
            stock_intake_mode=INTAKE_DISASSEMBLE,
            fg_intake_qty=0,
            disassembly_qty=1,
            component_recoveries=[],
        )
        settings = SimpleNamespace(manufactured_component_recovery_mode=RECOVERY_MODE_OPTIONAL)
        with patch(
            "backend.services.returns.manufactured_component_recovery_service.product_qualifies_for_manufacturing_recovery",
            return_value=False,
        ):
            apply_manufacturing_recovery_to_line(
                db,
                tenant_id=1,
                rmz_line=ln,  # type: ignore[arg-type]
                settings=settings,  # type: ignore[arg-type]
                is_bundle_line=True,
                stock_intake_mode=None,
                fg_intake_qty=None,
                disassembly_qty=None,
                component_recoveries=None,
            )
        self.assertEqual(ln.stock_intake_mode, INTAKE_DISASSEMBLE)
        self.assertEqual(ln.disassembly_qty, 1)


if __name__ == "__main__":
    unittest.main()
