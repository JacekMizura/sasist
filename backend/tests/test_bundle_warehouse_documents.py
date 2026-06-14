"""P4.14A — Bundle warehouse document layer tests (20+)."""

from __future__ import annotations

import json

import pytest

from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundles.bundle_warehouse_document_projections import (
    warehouse_document_lines,
    warehouse_receipt_lines,
)
from backend.services.bundles.bundle_warehouse_document_service import (
    audit_document_views_for_order,
    document_lines_for_order,
    expected_warehouse_product_quantities,
    receipt_lines_for_order,
    stock_document_item_kwargs_from_projection,
)
from backend.tests.test_bundle_line_resolver import _ctx_on_demand, _ctx_stock


def _oi(*, oid: int, pid: int, qty: int = 1, is_parent: bool = False, parent_id: int | None = None, mode: str | None = None) -> OrderItem:
    meta = None
    if mode and is_parent:
        meta = json.dumps({"bundle_fulfillment_mode": mode, "bundle_id": 7, "bundle_name_snapshot": "Promo"})
    return OrderItem(
        id=oid,
        order_id=100,
        product_id=pid,
        quantity=qty,
        is_bundle_parent=is_parent,
        parent_bundle_order_item_id=parent_id,
        metadata_json=meta,
        source_bundle_id=7 if is_parent else None,
    )


def _order_with_items(*items: OrderItem) -> Order:
    o = Order(id=100, tenant_id=1, warehouse_id=1)
    o.items = list(items)
    return o


class TestWarehouseDocumentProjectionOnDemand:
    def test_wz_commercial_shows_bundle_header(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="COMMERCIAL")
        assert len(lines) == 1
        assert lines[0].line_role == "bundle_header"
        assert lines[0].product_name == "Promo"
        assert lines[0].quantity == 2

    def test_wz_warehouse_shows_components(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")
        assert len(lines) == 2
        assert {ln.product_id for ln in lines} == {101, 102}
        assert lines[0].unit_cost_snapshot == 5.0
        assert lines[0].source_bundle_id == 7

    def test_rw_wms_matches_components(self) -> None:
        ctx = _ctx_on_demand()
        wz = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")
        rw = warehouse_document_lines(ctx, document_type="RW_WMS", document_view="WAREHOUSE")
        assert {(l.product_id, l.quantity) for l in wz} == {(l.product_id, l.quantity) for l in rw}

    def test_mm_warehouse_components(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_document_lines(ctx, document_type="MM", document_view="WAREHOUSE")
        assert len(lines) == 2
        assert all(l.document_type == "MM" for l in lines)

    def test_pz_receipt_excludes_commercial_header(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_receipt_lines(ctx)
        assert all(l.line_role == "component" for l in lines)
        assert len(lines) == 2

    def test_accounting_includes_commercial_and_warehouse(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="ACCOUNTING")
        roles = {l.line_role for l in lines}
        assert "bundle_header" in roles
        assert "component" in roles


class TestWarehouseDocumentProjectionStock:
    def test_wz_commercial_bundle_header(self) -> None:
        ctx = _ctx_stock()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="COMMERCIAL")
        assert len(lines) == 1
        assert lines[0].line_role == "bundle_header"

    def test_wz_warehouse_linked_sku(self) -> None:
        ctx = _ctx_stock()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")
        assert len(lines) == 1
        assert lines[0].product_id == 103
        assert lines[0].line_role == "stock_sku"

    def test_production_rw_uses_components(self) -> None:
        ctx = _ctx_stock()
        lines = warehouse_document_lines(ctx, document_type="RW", document_view="WAREHOUSE")
        assert len(lines) >= 1
        assert lines[0].line_role == "component"

    def test_production_pw_finished_sku(self) -> None:
        ctx = _ctx_stock()
        lines = warehouse_document_lines(ctx, document_type="PW", document_view="WAREHOUSE")
        assert len(lines) == 1
        assert lines[0].line_role == "finished_sku"
        assert lines[0].product_id == 103


class TestOrderLevelDocumentLines:
    def _on_demand_order(self) -> Order:
        parent = _oi(oid=50, pid=101, qty=2, is_parent=True, mode=ON_DEMAND_ASSEMBLY)
        parent.metadata_json = json.dumps(
            {"bundle_fulfillment_mode": ON_DEMAND_ASSEMBLY, "bundle_id": 7, "bundle_name_snapshot": "Promo"}
        )
        parent.source_bundle_id = 7
        c1 = _oi(oid=51, pid=101, qty=4, parent_id=50)
        c2 = _oi(oid=52, pid=102, qty=2, parent_id=50)
        std = _oi(oid=60, pid=200, qty=1)
        std.product = Product(id=200, name="Solo", sku="SOLO")
        return _order_with_items(parent, c1, c2, std)

    def test_commercial_skips_components(self) -> None:
        from unittest.mock import MagicMock

        order = self._on_demand_order()
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.order_by.return_value.all.return_value = [
            order.items[0],
        ]
        parent = order.items[0]
        parent.bundle_component_snapshots = []

        from backend.models.order_line_bundle_component import OrderLineBundleComponent

        parent.bundle_component_snapshots = [
            OrderLineBundleComponent(
                id=1,
                order_line_id=50,
                order_id=100,
                bundle_id=7,
                product_id=101,
                product_name_snapshot="A",
                sku_snapshot="A",
                quantity_per_bundle=2,
                quantity_total=4,
                purchase_price_net_snapshot=5.0,
                unit_price_net_snapshot=30.0,
            ),
            OrderLineBundleComponent(
                id=2,
                order_line_id=50,
                order_id=100,
                bundle_id=7,
                product_id=102,
                product_name_snapshot="B",
                sku_snapshot="B",
                quantity_per_bundle=1,
                quantity_total=2,
                purchase_price_net_snapshot=3.0,
                unit_price_net_snapshot=39.0,
            ),
        ]
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [
            order.items[1],
            order.items[2],
        ]
        db.query.return_value.filter.return_value.first.return_value = None

        commercial = document_lines_for_order(db, order, document_type="WZ", document_view="COMMERCIAL")
        roles = {l.line_role for l in commercial}
        assert "component" not in roles
        assert "bundle_header" in roles or "standard_product" in roles

    def test_warehouse_skips_on_demand_parent(self) -> None:
        from unittest.mock import MagicMock

        order = self._on_demand_order()
        db = MagicMock()
        parent = order.items[0]
        parent.bundle_component_snapshots = []
        from backend.models.order_line_bundle_component import OrderLineBundleComponent

        parent.bundle_component_snapshots = [
            OrderLineBundleComponent(
                id=1,
                order_line_id=50,
                order_id=100,
                bundle_id=7,
                product_id=101,
                product_name_snapshot="A",
                sku_snapshot="A",
                quantity_per_bundle=2,
                quantity_total=4,
                purchase_price_net_snapshot=5.0,
            ),
        ]
        db.query.return_value.options.return_value.filter.return_value.order_by.return_value.all.return_value = [parent]
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [order.items[1]]
        db.query.return_value.filter.return_value.first.return_value = None

        wh = document_lines_for_order(db, order, document_type="WZ", document_view="WAREHOUSE")
        assert all(l.line_role != "bundle_header" for l in wh)

    def test_expected_quantities_merged(self) -> None:
        ctx = _ctx_on_demand()
        from backend.services.bundles.bundle_warehouse_document_service import document_lines_for_bundle_context

        lines = document_lines_for_bundle_context(ctx, document_type="WZ", document_view="WAREHOUSE")
        merged: dict[int, float] = {}
        for ln in lines:
            merged[int(ln.product_id)] = merged.get(int(ln.product_id), 0) + float(ln.quantity)
        assert merged[101] == 4
        assert merged[102] == 2


class TestSnapshotIsolationAndPricing:
    def test_cost_from_snapshot_not_live(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")
        costs = {l.product_id: l.unit_cost_snapshot for l in lines}
        assert costs[101] == 5.0
        assert costs[102] == 3.0

    def test_unit_price_snapshot_on_components(self) -> None:
        ctx = _ctx_on_demand()
        lines = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")
        assert all(l.unit_price_snapshot is not None for l in lines)

    def test_recipe_change_does_not_affect_projection(self) -> None:
        ctx = _ctx_on_demand()
        pids = {l.product_id for l in warehouse_document_lines(ctx, document_type="MM", document_view="WAREHOUSE")}
        assert 999 not in pids

    def test_stock_document_item_kwargs(self) -> None:
        ctx = _ctx_on_demand()
        line = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")[0]
        kw = stock_document_item_kwargs_from_projection(line)
        assert kw["product_id"] == line.product_id
        assert kw["quantity"] == line.quantity
        assert kw["purchase_price_net"] == line.unit_cost_snapshot


class TestAuditViews:
    def test_audit_all_document_types(self) -> None:
        from unittest.mock import MagicMock

        order = _order_with_items(_oi(oid=1, pid=10, qty=1))
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.order_by.return_value.all.return_value = []
        audit = audit_document_views_for_order(db, order)
        assert set(audit.keys()) == {"WZ", "RW", "PW", "PZ", "MM", "RW_WMS"}
        for dt in audit:
            assert "commercial" in audit[dt]
            assert "warehouse" in audit[dt]
            assert "accounting" in audit[dt]

    def test_receipt_lines_standard_product(self) -> None:
        from unittest.mock import MagicMock

        item = _oi(oid=5, pid=55, qty=3)
        item.product = Product(id=55, name="X", sku="X")
        order = _order_with_items(item)
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.order_by.return_value.all.return_value = []
        lines = receipt_lines_for_order(db, order)
        assert len(lines) == 1
        assert lines[0].product_id == 55
        assert lines[0].document_type == "PZ"

    def test_stock_cost_per_unit_aggregate(self) -> None:
        ctx = _ctx_stock()
        line = warehouse_document_lines(ctx, document_type="WZ", document_view="WAREHOUSE")[0]
        assert line.unit_cost_snapshot == pytest.approx(5.0)
