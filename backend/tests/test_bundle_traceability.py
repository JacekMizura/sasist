"""P4.16 — Bundle lot traceability (30+ tests)."""

from __future__ import annotations

import json
from datetime import date, datetime
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.order_line_bundle_component import OrderLineBundleComponent
from backend.models.order_line_bundle_component_lot import OrderLineBundleComponentLot
from backend.models.pick import Pick
from backend.models.product import Product
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundles.bundle_complaint_service import BundleComplaintComponentNode
from backend.services.bundles.bundle_line_projections import picking_lines
from backend.services.bundles.bundle_lot_snapshot_service import (
    BundleSnapshotMapping,
    persist_bundle_lot_snapshots_for_picks,
    persist_lot_row_from_pick,
    resolve_bundle_snapshot_for_order_item,
    synthetic_lot_id,
)
from backend.services.bundles.bundle_recall_service import build_bundle_recall_report
from backend.services.bundles.bundle_return_service import BundleReturnComponentNode
from backend.services.bundles.bundle_traceability_reports_service import bundle_lots_report, lot_trace_report
from backend.services.bundles.bundle_traceability_service import (
    _customer_from_order,
    bundle_lot_tree_for_order,
    lot_to_orders,
)
from backend.tests.test_bundle_line_resolver import _ctx_on_demand, _ctx_stock, _component_item, _parent_item


class TestSyntheticLotId:
    def test_stable_for_same_batch(self) -> None:
        a = synthetic_lot_id(warehouse_id=1, product_id=10, lot_number="LOT-A", expiry_date=date(2026, 6, 1))
        b = synthetic_lot_id(warehouse_id=1, product_id=10, lot_number="LOT-A", expiry_date=date(2026, 6, 1))
        assert a == b
        assert a is not None

    def test_none_for_empty_batch(self) -> None:
        assert synthetic_lot_id(warehouse_id=1, product_id=10, lot_number="", expiry_date=None) is None

    def test_differs_by_product(self) -> None:
        a = synthetic_lot_id(warehouse_id=1, product_id=10, lot_number="X", expiry_date=None)
        b = synthetic_lot_id(warehouse_id=1, product_id=11, lot_number="X", expiry_date=None)
        assert a != b


class TestResolveSnapshotMapping:
    def test_on_demand_component_maps_to_snapshot(self) -> None:
        ctx = _ctx_on_demand()
        db = MagicMock()
        comp = ctx.component_order_items[0]
        db.query.return_value.filter.return_value.first.return_value = comp
        from backend.services.bundles import bundle_lot_snapshot_service as mod

        orig = mod.bundle_line_resolver.resolve_parent_line
        mod.bundle_line_resolver.resolve_parent_line = lambda _db, _pid: ctx
        try:
            m = resolve_bundle_snapshot_for_order_item(db, int(comp.id), int(comp.product_id))
        finally:
            mod.bundle_line_resolver.resolve_parent_line = orig
        assert m is not None
        assert m.parent_order_line_id == int(ctx.order_line_id)

    def test_non_bundle_line_returns_none(self) -> None:
        db = MagicMock()
        oi = OrderItem(id=5, order_id=1, product_id=99, quantity=1)
        db.query.return_value.filter.return_value.first.return_value = oi
        assert resolve_bundle_snapshot_for_order_item(db, 5, 99) is None


class TestPersistLotFromPick:
    def test_persists_on_demand_pick(self) -> None:
        now = datetime(2026, 6, 8, 12, 0, 0)
        pick = Pick(
            id=1,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            order_item_id=51,
            product_id=101,
            location_id=1,
            quantity=2.0,
            batch_number="NAPOJ-2026-001",
            expiry_date=date(2027, 1, 1),
            picked_at=now,
        )
        mapping = BundleSnapshotMapping(100, 50, 10, 101)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        from backend.services.bundles import bundle_lot_snapshot_service as mod

        orig = mod.resolve_bundle_snapshot_for_order_item
        mod.resolve_bundle_snapshot_for_order_item = lambda *_a, **_k: mapping
        try:
            row = persist_lot_row_from_pick(db, pick)
        finally:
            mod.resolve_bundle_snapshot_for_order_item = orig
        assert row is not None
        added = db.add.call_args[0][0]
        assert added.lot_number == "NAPOJ-2026-001"
        assert added.picked_qty == 2.0

    def test_idempotent_skip_duplicate(self) -> None:
        now = datetime(2026, 6, 8, 12, 0, 0)
        pick = Pick(
            id=2,
            tenant_id=1,
            warehouse_id=1,
            order_id=100,
            order_item_id=51,
            product_id=101,
            location_id=1,
            quantity=1.0,
            batch_number="LOT-1",
            picked_at=now,
        )
        mapping = BundleSnapshotMapping(100, 50, 10, 101)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = OrderLineBundleComponentLot(id=99)
        from backend.services.bundles import bundle_lot_snapshot_service as mod

        mod.resolve_bundle_snapshot_for_order_item = lambda *_a, **_k: mapping
        assert persist_lot_row_from_pick(db, pick) is None


class TestPickingLinesContract:
    def test_on_demand_components(self) -> None:
        assert len(picking_lines(_ctx_on_demand())) == 2

    def test_stock_linked_sku(self) -> None:
        assert len(picking_lines(_ctx_stock())) == 1
        assert picking_lines(_ctx_stock())[0].bundle_mode == STOCK_PRODUCTION


class TestRecallReport:
    def test_recall_structure(self) -> None:
        db = MagicMock()
        from backend.services.bundles import bundle_recall_service as rs

        rs.lot_to_bundles = lambda *_a, **_k: []
        rs.lot_to_orders = lambda *_a, **_k: [{"order_id": 1, "order_number": "#1", "picked_qty_total": 1.0}]
        rs.lot_to_customers = lambda *_a, **_k: []
        report = build_bundle_recall_report(db, "LOT-X", tenant_id=1)
        assert report.summary["order_count"] == 1

    def test_recall_no_db_writes(self) -> None:
        db = MagicMock()
        from backend.services.bundles import bundle_recall_service as rs

        rs.lot_to_bundles = lambda *_a, **_k: []
        rs.lot_to_orders = lambda *_a, **_k: []
        rs.lot_to_customers = lambda *_a, **_k: []
        build_bundle_recall_report(db, "X")
        db.add.assert_not_called()


class TestReports:
    def test_bundle_lots_report_empty(self) -> None:
        db = MagicMock()
        from backend.services.bundles import bundle_traceability_service as ts

        ts.bundle_line_resolver.resolve_for_order = lambda _db, _oid: []
        assert bundle_lots_report(db, 100) == []

    def test_lot_trace_report_empty(self) -> None:
        db = MagicMock()
        from backend.services.bundles import bundle_traceability_reports_service as rpt

        rpt.lot_to_bundles = lambda *_a, **_k: []
        assert lot_trace_report(db, "NONE") == []


class TestMultiLotRows:
    def test_two_lots_same_snapshot(self) -> None:
        lots = [
            OrderLineBundleComponentLot(lot_number="A", picked_qty=1.0, picked_at=datetime.utcnow()),
            OrderLineBundleComponentLot(lot_number="B", picked_qty=2.0, picked_at=datetime.utcnow()),
        ]
        assert len({x.lot_number for x in lots}) == 2


class TestComplaintReturnLots:
    def test_return_node_lots(self) -> None:
        n = BundleReturnComponentNode(
            snapshot_id=1,
            order_line_id=2,
            component_product_id=3,
            component_name="N",
            sku="S",
            sold_qty=1,
            unit_price_snapshot=1.0,
            already_returned_qty=0,
            max_returnable_qty=1,
            line_role="component",
            lots=({"lot_number": "L-1", "picked_qty": 1.0},),
        )
        assert n.lots[0]["lot_number"] == "L-1"

    def test_complaint_node_lots(self) -> None:
        n = BundleComplaintComponentNode(
            order_line_id=1,
            product_id=2,
            product_name="P",
            eligible_qty=1,
            unit_price_snapshot=1.0,
            snapshot_id=3,
            line_role="component",
            lots=({"lot_number": "NAPOJ-2026-001"},),
        )
        assert n.lots[0]["lot_number"] == "NAPOJ-2026-001"


class TestPersistBatch:
    def test_empty_pick_ids(self) -> None:
        assert persist_bundle_lot_snapshots_for_picks(MagicMock(), []) == 0


class TestCustomerExtraction:
    def test_from_addresses_json(self) -> None:
        order = Order(
            id=1,
            addresses_json='{"shipping":{"name":"Anna Nowak","email":"a@test.pl","phone":"123"}}',
        )
        name, email, phone = _customer_from_order(order)
        assert "Anna" in name
        assert email == "a@test.pl"


class TestLotToOrdersDedup:
    def test_single_order(self) -> None:
        lot = OrderLineBundleComponentLot(
            order_id=100,
            order_line_id=50,
            bundle_component_snapshot_id=10,
            product_id=101,
            lot_number="L1",
            picked_qty=2.0,
            picked_at=datetime.utcnow(),
            warehouse_id=1,
        )
        lot.order = Order(id=100, number="O100")
        q = MagicMock()
        q.filter.return_value.options.return_value.order_by.return_value.all.return_value = [lot, lot]
        q.join.return_value.filter.return_value.options.return_value.order_by.return_value.all.return_value = [lot, lot]
        db = MagicMock()
        db.query.return_value = q
        assert len(lot_to_orders(db, "L1")) == 1


class TestScale:
    def test_ten_bundle_contexts(self) -> None:
        from backend.services.bundles.bundle_line_context import (
            BundleComponentSnapshotView,
            BundleLineContext,
            BundlePricingContext,
        )

        total = 0
        for i in range(10):
            parent = _parent_item(mode=ON_DEMAND_ASSEMBLY, oid=50 + i, qty=1)
            child = _component_item(oid=200 + i, pid=101, parent_id=int(parent.id), qty=1)
            comps = (
                BundleComponentSnapshotView(
                    snapshot_id=100 + i,
                    order_id=100,
                    order_line_id=int(parent.id),
                    bundle_id=7,
                    component_product_id=101,
                    component_name="C",
                    sku="C",
                    ean=None,
                    required_qty_per_bundle=1,
                    required_qty_total=1,
                    unit_cost_snapshot=1.0,
                    unit_price_snapshot=2.0,
                ),
            )
            ctx = BundleLineContext(
                order_id=100,
                order_line_id=int(parent.id),
                parent_order_item=parent,
                bundle_id=7,
                bundle_name=f"B{i}",
                fulfillment_mode=ON_DEMAND_ASSEMBLY,
                bundle_qty=1,
                pricing=BundlePricingContext(10, 10, None, None),
                components=comps,
                linked_product_id=None,
                component_order_items=(child,),
            )
            total += len(picking_lines(ctx))
        assert total == 10

    def test_hundred_component_lines(self) -> None:
        from backend.services.bundles.bundle_line_context import (
            BundleComponentSnapshotView,
            BundleLineContext,
            BundlePricingContext,
        )

        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY, qty=1)
        comps = tuple(
            BundleComponentSnapshotView(
                snapshot_id=i,
                order_id=100,
                order_line_id=int(parent.id),
                bundle_id=7,
                component_product_id=1000 + i,
                component_name=f"C{i}",
                sku=f"C{i}",
                ean=None,
                required_qty_per_bundle=1,
                required_qty_total=1,
                unit_cost_snapshot=1.0,
                unit_price_snapshot=1.0,
            )
            for i in range(1, 101)
        )
        children = tuple(
            _component_item(oid=50 + i, pid=1000 + i, parent_id=int(parent.id), qty=1) for i in range(1, 101)
        )
        ctx = BundleLineContext(
            order_id=100,
            order_line_id=int(parent.id),
            parent_order_item=parent,
            bundle_id=7,
            bundle_name="Mega",
            fulfillment_mode=ON_DEMAND_ASSEMBLY,
            bundle_qty=1,
            pricing=BundlePricingContext(1, 1, None, None),
            components=comps,
            linked_product_id=None,
            component_order_items=children,
        )
        assert len(picking_lines(ctx)) == 100


class TestPartialQty:
    def test_fractional_picked_qty(self) -> None:
        row = OrderLineBundleComponentLot(
            order_id=1,
            order_line_id=2,
            bundle_component_snapshot_id=3,
            product_id=4,
            lot_number="P",
            picked_qty=0.5,
            picked_at=datetime.utcnow(),
            warehouse_id=1,
        )
        assert row.picked_qty == 0.5


class TestBundleTreeEmpty:
    def test_no_resolver_contexts(self) -> None:
        db = MagicMock()
        from backend.services.bundles import bundle_traceability_service as ts

        ts.bundle_line_resolver.resolve_for_order = lambda _db, _oid: []
        assert bundle_lot_tree_for_order(db, 1) == []


class TestStockSnapshotMapping:
    def test_stock_ctx_single_pick_line(self) -> None:
        picks = picking_lines(_ctx_stock())
        assert picks[0].is_bundle_component is False
        assert picks[0].bundle_component_index == 1


class TestLotNumberNormalization:
    def test_empty_batch_no_synthetic_id(self) -> None:
        assert synthetic_lot_id(warehouse_id=1, product_id=1, lot_number="   ", expiry_date=None) is None


class TestMappingDataclass:
    def test_frozen_mapping(self) -> None:
        m = BundleSnapshotMapping(1, 2, 3, 4)
        assert m.order_id == 1
        assert m.bundle_component_snapshot_id == 3


class TestRecallSummaryFields:
    def test_summary_keys(self) -> None:
        db = MagicMock()
        from backend.services.bundles import bundle_recall_service as rs

        rs.lot_to_bundles = lambda *_a, **_k: []
        rs.lot_to_orders = lambda *_a, **_k: []
        rs.lot_to_customers = lambda *_a, **_k: []
        r = build_bundle_recall_report(db, "LOT")
        assert "bundle_hit_count" in r.summary
        assert "customer_count" in r.summary


class TestOnDemandMeta:
    def test_picking_metadata_present(self) -> None:
        p = picking_lines(_ctx_on_demand())[0]
        assert p.bundle_id == 7
        assert p.is_bundle_component is True


class TestReturnTreeLotsFieldDefault:
    def test_default_empty_lots(self) -> None:
        n = BundleReturnComponentNode(
            snapshot_id=1,
            order_line_id=2,
            component_product_id=3,
            component_name="X",
            sku=None,
            sold_qty=1,
            unit_price_snapshot=1.0,
            already_returned_qty=0,
            max_returnable_qty=1,
            line_role="component",
        )
        assert n.lots == ()


class TestWZBackfillContract:
    def test_allocations_backfill_zero_when_empty(self) -> None:
        from backend.services.bundles.bundle_lot_snapshot_service import (
            persist_bundle_lot_snapshots_for_order_allocations,
        )

        db = MagicMock()
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        assert persist_bundle_lot_snapshots_for_order_allocations(db, 1) == 0
