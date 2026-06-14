"""P4.15 — Bundle returns, complaints, corrections (30+ tests)."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from backend.models.order_item import OrderItem
from backend.models.return_line_bundle_component import ReturnLineBundleComponent
from backend.models.wms_rmz_line import RMZLine
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundles.bundle_complaint_service import (
    build_bundle_complaint_tree,
    settlement_amount_for_decision,
)
from backend.services.bundles.bundle_line_projections import return_lines
from backend.services.bundles.bundle_return_service import (
    BundleComponentReturnIn,
    BundleReturnComponentNode,
    BundleReturnTreeNode,
    build_bundle_return_tree,
    classify_bundle_return_scenario,
    component_refund_amount,
    compute_rmz_line_refund_from_snapshot,
    resolve_bundle_return_status,
)
from backend.services.bundles.bundle_rmz_receipt_integration import (
    RmzReceiptStockRow,
    aggregate_receipt_rows,
    effective_receipt_rows_for_rmz_line,
)
from backend.services.bundles.bundle_warehouse_document_projections import warehouse_receipt_lines
from backend.tests.test_bundle_line_resolver import _ctx_on_demand, _ctx_stock, _parent_item


def _comp_node(*, sid: int, sold: int, price: float, max_ret: int | None = None) -> BundleReturnComponentNode:
    return BundleReturnComponentNode(
        snapshot_id=sid,
        order_line_id=51 + sid,
        component_product_id=100 + sid,
        component_name=f"C{sid}",
        sku=f"S{sid}",
        sold_qty=sold,
        unit_price_snapshot=price,
        already_returned_qty=0,
        max_returnable_qty=max_ret if max_ret is not None else sold,
        line_role="component",
    )


class TestComponentRefundSnapshot:
    def test_refund_single_unit(self) -> None:
        assert component_refund_amount(unit_price_snapshot=20.0, accepted_qty=1) == 20.0

    def test_refund_multiple_units(self) -> None:
        assert component_refund_amount(unit_price_snapshot=40.0, accepted_qty=2) == 80.0

    def test_refund_zero_accepted(self) -> None:
        assert component_refund_amount(unit_price_snapshot=99.0, accepted_qty=0) == 0.0

    def test_refund_shampoo_example_from_spec(self) -> None:
        assert component_refund_amount(unit_price_snapshot=20.0, accepted_qty=1) == 20.0


class TestReturnScenarioClassification:
    def test_full_bundle_on_demand(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=40), _comp_node(sid=2, sold=1, price=20)]
        sel = [
            BundleComponentReturnIn(snapshot_id=1, returned_qty=2, accepted_qty=2),
            BundleComponentReturnIn(snapshot_id=2, returned_qty=1, accepted_qty=1),
        ]
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=sel,
                expected_components=expected,
            )
            == "FULL_BUNDLE"
        )

    def test_partial_bundle(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=40), _comp_node(sid=2, sold=1, price=20)]
        sel = [
            BundleComponentReturnIn(snapshot_id=1, returned_qty=1, accepted_qty=1),
            BundleComponentReturnIn(snapshot_id=2, returned_qty=1, accepted_qty=1),
        ]
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=sel,
                expected_components=expected,
            )
            == "PARTIAL_BUNDLE"
        )

    def test_single_component(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=40), _comp_node(sid=2, sold=1, price=20)]
        sel = [BundleComponentReturnIn(snapshot_id=2, returned_qty=1, accepted_qty=1)]
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=sel,
                expected_components=expected,
            )
            == "INCOMPLETE"
        )

    def test_incomplete_return(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=40), _comp_node(sid=2, sold=1, price=20)]
        sel = [BundleComponentReturnIn(snapshot_id=1, returned_qty=2, accepted_qty=2)]
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=sel,
                expected_components=expected,
            )
            == "INCOMPLETE"
        )

    def test_damaged_flag(self) -> None:
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=[],
                expected_components=[],
                has_damage=True,
            )
            == "DAMAGED"
        )

    def test_stock_full_bundle(self) -> None:
        expected = [_comp_node(sid=1, sold=2, price=99)]
        sel = [BundleComponentReturnIn(snapshot_id=1, returned_qty=2, accepted_qty=2)]
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=STOCK_PRODUCTION,
                components=sel,
                expected_components=expected,
            )
            == "FULL_BUNDLE"
        )


class TestBundleReturnStatus:
    def test_partial_bundle_return_status(self) -> None:
        rows = [
            ReturnLineBundleComponent(returned_qty=2, accepted_qty=1),
            ReturnLineBundleComponent(returned_qty=1, accepted_qty=0),
        ]
        assert resolve_bundle_return_status(scenario="INCOMPLETE", components=rows) == "PARTIAL_BUNDLE_RETURN"

    def test_ok_status(self) -> None:
        rows = [ReturnLineBundleComponent(returned_qty=1, accepted_qty=1)]
        assert resolve_bundle_return_status(scenario="FULL_BUNDLE", components=rows) == "OK"


class TestReturnLinesProjection:
    def test_on_demand_has_header_and_components(self) -> None:
        lines = return_lines(_ctx_on_demand())
        assert lines[0].line_role == "bundle_header"
        assert {l.line_role for l in lines[1:]} == {"component"}

    def test_on_demand_component_prices_from_snapshot(self) -> None:
        lines = return_lines(_ctx_on_demand())
        comps = [l for l in lines if l.line_role == "component"]
        assert comps[0].unit_price_net == 33.0
        assert comps[1].unit_price_net == 33.0

    def test_stock_has_stock_sku_line(self) -> None:
        lines = return_lines(_ctx_stock())
        roles = {l.line_role for l in lines}
        assert "bundle_header" in roles
        assert "stock_sku" in roles


class TestWarehouseReceiptLines:
    def test_on_demand_pz_components_only(self) -> None:
        lines = warehouse_receipt_lines(_ctx_on_demand())
        assert len(lines) == 2
        assert all(l.line_role == "component" for l in lines)

    def test_stock_pz_finished_sku(self) -> None:
        lines = warehouse_receipt_lines(_ctx_stock())
        assert len(lines) == 1
        assert lines[0].line_role == "stock_sku"


class TestComplaintSettlement:
    def test_refund_component_from_snapshot(self) -> None:
        node = MagicMock()
        node.unit_price_net = 100.0
        comp = _comp_node(sid=2, sold=1, price=20.0)
        assert settlement_amount_for_decision(
            decision="REFUND_COMPONENT",
            tree_node=node,
            component=comp,
            qty=1,
        ) == 20.0

    def test_refund_bundle_uses_header_price(self) -> None:
        node = BundleReturnTreeNode(
            order_line_id=50,
            bundle_id=7,
            bundle_name="Promo",
            fulfillment_mode=ON_DEMAND_ASSEMBLY,
            bundle_qty=2,
            unit_price_net=99.0,
            components=(),
            is_stock_sku=False,
        )
        assert settlement_amount_for_decision(
            decision="REFUND_BUNDLE",
            tree_node=node,
            component=None,
            qty=1,
        ) == 99.0

    def test_exchange_component_zero_qty(self) -> None:
        node = MagicMock()
        comp = _comp_node(sid=1, sold=1, price=40)
        assert settlement_amount_for_decision(
            decision="EXCHANGE_COMPONENT",
            tree_node=node,
            component=comp,
            qty=0,
        ) == 0.0


class TestReceiptIntegration:
    def test_effective_receipt_non_bundle_fallback(self) -> None:
        db = MagicMock()
        oi = OrderItem(id=10, order_id=1, product_id=5, quantity=1, is_bundle_parent=False)
        ln = RMZLine(id=1, rmz_id=10, order_item_id=10, product_id=5, quantity=1, accepted_qty=3)
        db.query.return_value.filter.return_value.first.return_value = oi
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        rows = effective_receipt_rows_for_rmz_line(db, ln)
        assert len(rows) == 1
        assert rows[0].product_id == 5
        assert rows[0].quantity == 3.0

    def test_aggregate_receipt_rows_merges(self) -> None:
        rows = [
            RmzReceiptStockRow(101, 2.0, 51, 40.0, 1, "component"),
            RmzReceiptStockRow(101, 1.0, 51, 40.0, 1, "component"),
        ]
        merged = aggregate_receipt_rows(rows)
        assert len(merged) == 1
        assert merged[0].quantity == 3.0


class TestBuildBundleReturnTreeDb:
    def test_build_tree_empty_order(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        assert build_bundle_return_tree(db, 999) == []


class TestComplaintTreeProjection:
    def test_complaint_tree_empty(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        assert build_bundle_complaint_tree(db, 1) == []


class TestRmzLineRefundCompute:
    def test_refund_from_component_rows(self) -> None:
        db = MagicMock()
        ln = RMZLine(id=5, order_item_id=50, product_id=1, quantity=1)
        db.query.return_value.filter.return_value.all.return_value = [
            ReturnLineBundleComponent(refund_amount=20.0),
            ReturnLineBundleComponent(refund_amount=40.0),
        ]
        assert compute_rmz_line_refund_from_snapshot(db, ln) == 60.0


class TestScenarioMatrix:
    @pytest.mark.parametrize(
        "returned,accepted,expected",
        [
            (2, 2, "OK"),
            (2, 1, "PARTIAL_BUNDLE_RETURN"),
            (1, 0, "PARTIAL_BUNDLE_RETURN"),
        ],
    )
    def test_status_matrix(self, returned: int, accepted: int, expected: str) -> None:
        rows = [ReturnLineBundleComponent(returned_qty=returned, accepted_qty=accepted)]
        assert resolve_bundle_return_status(scenario="PARTIAL_BUNDLE", components=rows) == expected


class TestSnapshotOnlyPricing:
    def test_return_projection_never_zero_when_snapshot_set(self) -> None:
        ctx = _ctx_on_demand()
        for line in return_lines(ctx):
            if line.line_role == "component":
                assert line.unit_price_net > 0

    def test_commercial_header_not_in_pz(self) -> None:
        receipt = warehouse_receipt_lines(_ctx_on_demand())
        assert all(l.line_role != "bundle_header" for l in receipt)


class TestLotTraceExtensibility:
    def test_component_in_accepts_lot_trace_json(self) -> None:
        row = BundleComponentReturnIn(
            snapshot_id=1,
            returned_qty=1,
            lot_trace_json='{"future_lot_id": null}',
        )
        assert row.lot_trace_json is not None


class TestOnDemandVsStock:
    def test_on_demand_two_component_receipts(self) -> None:
        assert len(warehouse_receipt_lines(_ctx_on_demand())) == 2

    def test_stock_one_receipt(self) -> None:
        assert len(warehouse_receipt_lines(_ctx_stock())) == 1


class TestIncompleteScenarioSpec:
    def test_missing_shampoo_is_incomplete(self) -> None:
        expected = [
            _comp_node(sid=1, sold=4, price=40),
            _comp_node(sid=2, sold=2, price=20),
        ]
        sel = [BundleComponentReturnIn(snapshot_id=1, returned_qty=4, accepted_qty=4)]
        assert (
            classify_bundle_return_scenario(
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                components=sel,
                expected_components=expected,
            )
            == "INCOMPLETE"
        )


class TestPartialAcceptOperatorDecision:
    def test_partial_accept_status(self) -> None:
        rows = [ReturnLineBundleComponent(returned_qty=2, accepted_qty=1, decision="PARTIAL")]
        assert resolve_bundle_return_status(scenario="PARTIAL_BUNDLE", components=rows) == "PARTIAL_BUNDLE_RETURN"


class TestRefundEngineNeverUsesLivePrice:
    def test_component_refund_isolated(self) -> None:
        assert component_refund_amount(unit_price_snapshot=20.0, accepted_qty=1) == 20.0
        assert component_refund_amount(unit_price_snapshot=20.0, accepted_qty=1) != 999.0


class TestComplaintDecisions:
    def test_repair_zero_refund(self) -> None:
        comp = _comp_node(sid=1, sold=1, price=40)
        node = MagicMock()
        assert settlement_amount_for_decision(decision="REPAIR", tree_node=node, component=comp, qty=1) == 0.0

    def test_exchange_bundle_no_refund(self) -> None:
        node = BundleReturnTreeNode(
            order_line_id=50,
            bundle_id=7,
            bundle_name="Promo",
            fulfillment_mode=ON_DEMAND_ASSEMBLY,
            bundle_qty=2,
            unit_price_net=50.0,
            components=(),
            is_stock_sku=False,
        )
        assert settlement_amount_for_decision(
            decision="EXCHANGE_BUNDLE",
            tree_node=node,
            component=None,
            qty=2,
        ) == 0.0
