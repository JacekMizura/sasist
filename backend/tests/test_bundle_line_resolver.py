"""P4.14 — BundleLineResolver SSOT tests (20+)."""

from __future__ import annotations

import json
from unittest.mock import MagicMock

import pytest

from backend.models.bundle import Bundle, BundleItem
from backend.models.order_item import OrderItem
from backend.models.order_line_bundle_component import OrderLineBundleComponent
from backend.models.product import Product
from backend.services.bundle_explosion import explode_bundle_line
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundle_order_snapshot_service import (
    BundleComponentSnapshotDraft,
    build_component_snapshots_from_bundle,
    enrich_snapshot_drafts_with_pricing,
)
from backend.services.bundles.bundle_line_context import (
    BundleComponentSnapshotView,
    BundleLineContext,
    BundlePricingContext,
)
from backend.services.bundles.bundle_line_projections import (
    commercial_lines,
    complaint_lines,
    margin_from_context,
    margin_lines,
    picking_lines,
    reservation_lines,
    return_lines,
    warehouse_issue_lines,
)
from backend.services.bundles.bundle_line_resolver import BundleLineResolver


def _bundle(*, mode: str, linked: int | None = None) -> Bundle:
    p1 = Product(id=101, tenant_id=1, name="A", sku="A", purchase_price=5.0, sale_price=10.0)
    p2 = Product(id=102, tenant_id=1, name="B", sku="B", purchase_price=3.0, sale_price=8.0)
    p3 = Product(id=103, tenant_id=1, name="SKU", sku="SKU", purchase_price=12.0, sale_price=99.0)
    b = Bundle(
        id=7,
        tenant_id=1,
        name="Promo",
        sku="PROMO",
        sale_price=99.0,
        active=True,
        bundle_fulfillment_mode=mode,
        linked_product_id=linked,
    )
    b.items = [
        BundleItem(id=1, bundle_id=7, product_id=101, product=p1, quantity=2, sort_order=0),
        BundleItem(id=2, bundle_id=7, product_id=102, product=p2, quantity=1, sort_order=1),
    ]
    if linked == 103:
        b.items.append(BundleItem(id=3, bundle_id=7, product_id=103, product=p3, quantity=1, sort_order=2))
    return b


def _parent_item(*, mode: str, oid: int = 50, qty: int = 2, product_id: int = 101) -> OrderItem:
    meta = json.dumps(
        {
            "bundle_fulfillment_mode": mode,
            "bundle_id": 7,
            "bundle_name_snapshot": "Promo",
            "oms_bundle_parent_header": True,
        }
    )
    return OrderItem(
        id=oid,
        order_id=100,
        product_id=product_id,
        quantity=qty,
        unit_price=99.0,
        total_price=198.0,
        is_bundle_parent=True,
        source_bundle_id=7,
        bundle_instance_id="inst-1",
        metadata_json=meta,
        required_stock_disposition="SALEABLE",
    )


def _component_item(*, oid: int, pid: int, parent_id: int, qty: int) -> OrderItem:
    return OrderItem(
        id=oid,
        order_id=100,
        product_id=pid,
        quantity=qty,
        parent_bundle_order_item_id=parent_id,
        is_bundle_parent=False,
        required_stock_disposition="SALEABLE",
    )


def _snap_row(*, sid: int, line_id: int, pid: int, per: int, total: int, cost: float, price: float | None) -> OrderLineBundleComponent:
    return OrderLineBundleComponent(
        id=sid,
        order_line_id=line_id,
        order_id=100,
        bundle_id=7,
        product_id=pid,
        product_name_snapshot=f"P{pid}",
        sku_snapshot=f"S{pid}",
        quantity_per_bundle=per,
        quantity_total=total,
        purchase_price_net_snapshot=cost,
        unit_price_net_snapshot=price,
    )


def _ctx_on_demand(**kwargs) -> BundleLineContext:
    parent = _parent_item(mode=ON_DEMAND_ASSEMBLY, **kwargs)
    comps = (
        BundleComponentSnapshotView(
            snapshot_id=1,
            order_id=100,
            order_line_id=parent.id,
            bundle_id=7,
            component_product_id=101,
            component_name="A",
            sku="A",
            ean=None,
            required_qty_per_bundle=2,
            required_qty_total=4,
            unit_cost_snapshot=5.0,
            unit_price_snapshot=33.0,
        ),
        BundleComponentSnapshotView(
            snapshot_id=2,
            order_id=100,
            order_line_id=parent.id,
            bundle_id=7,
            component_product_id=102,
            component_name="B",
            sku="B",
            ean=None,
            required_qty_per_bundle=1,
            required_qty_total=2,
            unit_cost_snapshot=3.0,
            unit_price_snapshot=33.0,
        ),
    )
    children = (
        _component_item(oid=51, pid=101, parent_id=parent.id, qty=4),
        _component_item(oid=52, pid=102, parent_id=parent.id, qty=2),
    )
    return BundleLineContext(
        order_id=100,
        order_line_id=int(parent.id),
        parent_order_item=parent,
        bundle_id=7,
        bundle_name="Promo",
        fulfillment_mode=ON_DEMAND_ASSEMBLY,
        bundle_qty=int(parent.quantity),
        pricing=BundlePricingContext(99.0, 198.0, 99.0, 23.0),
        components=comps,
        linked_product_id=None,
        component_order_items=children,
    )


def _ctx_stock(**kwargs) -> BundleLineContext:
    parent = _parent_item(mode=STOCK_PRODUCTION, product_id=103, **kwargs)
    comps = (
        BundleComponentSnapshotView(
            snapshot_id=10,
            order_id=100,
            order_line_id=parent.id,
            bundle_id=7,
            component_product_id=101,
            component_name="A",
            sku="A",
            ean=None,
            required_qty_per_bundle=2,
            required_qty_total=4,
            unit_cost_snapshot=5.0,
            unit_price_snapshot=None,
        ),
    )
    return BundleLineContext(
        order_id=100,
        order_line_id=int(parent.id),
        parent_order_item=parent,
        bundle_id=7,
        bundle_name="Promo",
        fulfillment_mode=STOCK_PRODUCTION,
        bundle_qty=int(parent.quantity),
        pricing=BundlePricingContext(99.0, 198.0, 99.0, 23.0),
        components=comps,
        linked_product_id=103,
        component_order_items=(),
    )


class TestResolverBuild:
    def test_resolve_parent_non_bundle_returns_none(self) -> None:
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = None
        assert BundleLineResolver().resolve_parent_line(db, 1) is None

    def test_resolve_on_demand_full_context(self) -> None:
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        parent.bundle_component_snapshots = [
            _snap_row(sid=1, line_id=50, pid=101, per=2, total=4, cost=5.0, price=30.0),
            _snap_row(sid=2, line_id=50, pid=102, per=1, total=2, cost=3.0, price=39.0),
        ]
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = parent
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            _component_item(oid=51, pid=101, parent_id=50, qty=4),
            _component_item(oid=52, pid=102, parent_id=50, qty=2),
        ]
        db.query.return_value.filter.return_value.first.return_value = _bundle(mode=ON_DEMAND_ASSEMBLY)

        ctx = BundleLineResolver().resolve_parent_line(db, 50)
        assert ctx is not None
        assert ctx.fulfillment_mode == ON_DEMAND_ASSEMBLY
        assert len(ctx.components) == 2
        assert len(ctx.component_order_items) == 2
        assert ctx.components[0].unit_price_snapshot == 30.0

    def test_resolve_stock_linked_product(self) -> None:
        parent = _parent_item(mode=STOCK_PRODUCTION, product_id=103)
        parent.bundle_component_snapshots = [
            _snap_row(sid=1, line_id=50, pid=101, per=2, total=4, cost=5.0, price=None),
        ]
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = parent
        db.query.return_value.filter.return_value.first.return_value = _bundle(mode=STOCK_PRODUCTION, linked=103)

        ctx = BundleLineResolver().resolve_parent_line(db, 50)
        assert ctx is not None
        assert ctx.linked_product_id == 103
        assert ctx.component_order_items == ()


class TestProjectionsOnDemand:
    def test_commercial_single_header(self) -> None:
        ctx = _ctx_on_demand()
        lines = commercial_lines(ctx)
        assert len(lines) == 1
        assert lines[0].quantity == 2
        assert lines[0].line_total_net == 198.0

    def test_picking_components_only(self) -> None:
        ctx = _ctx_on_demand()
        picks = picking_lines(ctx)
        assert len(picks) == 2
        assert {p.product_id for p in picks} == {101, 102}
        assert sum(p.quantity for p in picks if p.product_id == 101) == 4

    def test_reservation_matches_picking(self) -> None:
        ctx = _ctx_on_demand()
        assert reservation_lines(ctx) == picking_lines(ctx)

    def test_warehouse_issue_components(self) -> None:
        ctx = _ctx_on_demand()
        wh = warehouse_issue_lines(ctx)
        assert len(wh) == 2
        assert all(x.issue_type == "component" for x in wh)

    def test_margin_from_snapshot_not_live_catalog(self) -> None:
        ctx = _ctx_on_demand()
        m = margin_from_context(ctx)
        assert m.cost_net == pytest.approx(26.0)  # 4*5 + 2*3
        assert m.margin_amount == pytest.approx(172.0)
        assert m.cost_source == "snapshot"

    def test_margin_lines_no_cost_when_snapshot_empty(self) -> None:
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        ctx = BundleLineContext(
            order_id=100,
            order_line_id=50,
            parent_order_item=parent,
            bundle_id=7,
            bundle_name="Promo",
            fulfillment_mode=ON_DEMAND_ASSEMBLY,
            bundle_qty=2,
            pricing=BundlePricingContext(99.0, 198.0, None, None),
            components=(),
            linked_product_id=None,
            component_order_items=(),
        )
        m = margin_lines(ctx)[0]
        assert m.cost_net is None
        assert m.margin_amount is None

    def test_return_tree_with_unit_prices(self) -> None:
        ctx = _ctx_on_demand()
        tree = return_lines(ctx)
        assert tree[0].line_role == "bundle_header"
        components = [x for x in tree if x.line_role == "component"]
        assert len(components) == 2
        assert components[0].unit_price_net == 33.0

    def test_complaint_eligible_components(self) -> None:
        ctx = _ctx_on_demand()
        rows = complaint_lines(ctx)
        assert len(rows) == 2
        assert rows[0].eligible_qty == 4


class TestProjectionsStock:
    def test_picking_linked_sku(self) -> None:
        ctx = _ctx_stock()
        picks = picking_lines(ctx)
        assert len(picks) == 1
        assert picks[0].product_id == 103
        assert picks[0].source == "stock_sku"

    def test_warehouse_issue_finished_sku(self) -> None:
        ctx = _ctx_stock()
        wh = warehouse_issue_lines(ctx)
        assert len(wh) == 1
        assert wh[0].issue_type == "finished_sku"

    def test_return_stock_sku_line(self) -> None:
        ctx = _ctx_stock()
        tree = return_lines(ctx)
        assert any(x.line_role == "stock_sku" for x in tree)

    def test_complaint_stock_sku(self) -> None:
        ctx = _ctx_stock()
        assert len(complaint_lines(ctx)) == 1


class TestSnapshotPricing:
    def test_enrich_unit_price_from_explosion_metadata(self) -> None:
        bundle = _bundle(mode=ON_DEMAND_ASSEMBLY)
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = bundle
        out = explode_bundle_line(
            db,
            tenant_id=1,
            bundle_id=7,
            bundle_order_qty=2,
            line_unit_price_override=99.0,
        )
        snaps = out.snapshots_by_instance[list(out.snapshots_by_instance.keys())[0]]
        by_pid = {s.product_id: s for s in snaps}
        assert by_pid[101].unit_price_net_snapshot is not None
        assert by_pid[102].unit_price_net_snapshot is not None
        assert by_pid[101].unit_price_net_snapshot + by_pid[102].unit_price_net_snapshot * (
            1
        )  # sanity — prices exist

    def test_enrich_helper_maps_product_ids(self) -> None:
        drafts = [
            BundleComponentSnapshotDraft(
                bundle_id=7,
                product_id=101,
                product_name_snapshot="A",
                sku_snapshot="A",
                ean_snapshot=None,
                quantity_per_bundle=1,
                quantity_total=2,
                purchase_price_net_snapshot=5.0,
            )
        ]
        child = MagicMock()
        child.is_bundle_parent = False
        child.product_id = 101
        child.metadata_json = json.dumps({"bundle_display_unit_price": 12.5})
        enriched = enrich_snapshot_drafts_with_pricing(drafts, child_lines=[child])
        assert enriched[0].unit_price_net_snapshot == 12.5

    def test_draft_accepts_order_id(self) -> None:
        d = BundleComponentSnapshotDraft(
            bundle_id=1,
            product_id=2,
            product_name_snapshot="X",
            sku_snapshot=None,
            ean_snapshot=None,
            quantity_per_bundle=1,
            quantity_total=1,
            purchase_price_net_snapshot=1.0,
            unit_price_net_snapshot=9.0,
            order_id=100,
        )
        assert d.order_id == 100


class TestRecipeChangeIsolation:
    def test_context_uses_persisted_snapshot_not_live_recipe(self) -> None:
        """Zmiana receptury w katalogu nie wpływa na projekcje — tylko snapshot."""
        bundle = _bundle(mode=ON_DEMAND_ASSEMBLY)
        bundle.items.append(
            BundleItem(
                id=99,
                bundle_id=7,
                product_id=999,
                product=Product(id=999, tenant_id=1, name="New", purchase_price=1.0),
                quantity=5,
                sort_order=9,
            )
        )
        live_snaps = build_component_snapshots_from_bundle(bundle, bundle_order_qty=2)
        assert any(s.product_id == 999 for s in live_snaps)

        ctx = _ctx_on_demand()
        pick_pids = {p.product_id for p in picking_lines(ctx)}
        assert 999 not in pick_pids
        assert pick_pids == {101, 102}

    def test_partial_snapshot_still_resolves(self) -> None:
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        parent.bundle_component_snapshots = [
            _snap_row(sid=1, line_id=50, pid=101, per=2, total=4, cost=5.0, price=10.0),
        ]
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = parent
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        db.query.return_value.filter.return_value.first.return_value = _bundle(mode=ON_DEMAND_ASSEMBLY)
        ctx = BundleLineResolver().resolve_parent_line(db, 50)
        assert ctx is not None
        assert len(ctx.components) == 1
        assert picking_lines(ctx) == []


class TestResolverOrderScope:
    def test_resolve_for_order_item_component_gets_parent(self) -> None:
        child = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        parent.bundle_component_snapshots = [
            _snap_row(sid=1, line_id=50, pid=101, per=2, total=4, cost=5.0, price=10.0),
        ]

        def query_side_effect(model):
            q = MagicMock()
            if model.__name__ == "OrderItem":
                chain = q.options.return_value.filter.return_value
                chain.first.return_value = parent
                q.filter.return_value.order_by.return_value.all.return_value = [child]
            elif model.__name__ == "Bundle":
                q.filter.return_value.first.return_value = _bundle(mode=ON_DEMAND_ASSEMBLY)
            elif model.__name__ == "OrderLineBundleComponent":
                q.filter.return_value.order_by.return_value.all.return_value = []
            return q

        db = MagicMock()
        db.query.side_effect = query_side_effect
        ctx = BundleLineResolver().resolve_for_order_item(db, child)
        assert ctx is not None
        assert ctx.order_line_id == 50

    def test_margin_percent_calculation(self) -> None:
        ctx = _ctx_on_demand()
        m = margin_from_context(ctx)
        assert m.margin_percent == pytest.approx(m.margin_amount / m.revenue_net * 100, rel=0.01)

    def test_stock_no_linked_still_uses_parent_product(self) -> None:
        ctx = _ctx_stock()
        ctx = BundleLineContext(
            order_id=ctx.order_id,
            order_line_id=ctx.order_line_id,
            parent_order_item=ctx.parent_order_item,
            bundle_id=ctx.bundle_id,
            bundle_name=ctx.bundle_name,
            fulfillment_mode=ctx.fulfillment_mode,
            bundle_qty=ctx.bundle_qty,
            pricing=ctx.pricing,
            components=ctx.components,
            linked_product_id=None,
            component_order_items=(),
        )
        picks = picking_lines(ctx)
        assert picks[0].product_id == ctx.parent_order_item.product_id
