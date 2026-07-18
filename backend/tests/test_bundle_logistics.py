"""P4.17 — Bundle logistic unit & EAN automation (40+ tests)."""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.models.bundle import Bundle
from backend.models.bundle_logistic_unit import (
    BUNDLE_LOGISTIC_UNIT_STATUS,
    PLACEMENT_CART,
    PLACEMENT_CARRIER,
    PLACEMENT_LOCATION,
    PLACEMENT_PALLET,
)
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.services.bundle_operational_mode import ON_DEMAND_ASSEMBLY, STOCK_PRODUCTION
from backend.services.bundles.bundle_barcode_resolver import (
    bundle_internal_code,
    resolve_bundle_barcode,
)
from backend.services.bundles.bundle_consolidation_view import consolidation_rack_bundle_rows
from backend.services.bundles.bundle_logistic_unit_service import (
    list_logistic_units_for_warehouse,
    place_bundle_logistic_unit,
)
from backend.services.bundles.bundle_scan_service import (
    bulk_stock_pick_scan_result,
    handle_complaint_bundle_scan,
    handle_packing_bundle_scan,
    handle_picking_bundle_scan,
    handle_returns_bundle_scan,
)
from backend.services.bundles.bundle_wave_aggregation import (
    wave_aggregate_lines,
    wave_aggregate_mode_for_order_items,
    wave_aggregate_product_id_for_line,
)
from backend.services.bundles.bundle_operational_ux_service import BundleOperationalUxMeta
from backend.tests.test_bundle_line_resolver import _component_item, _ctx_on_demand, _ctx_stock, _parent_item


def _ux_index_for_on_demand(ctx) -> dict[int, BundleOperationalUxMeta]:
    parent_id = int(ctx.order_line_id)
    idx = 1
    out: dict[int, BundleOperationalUxMeta] = {}
    for oi in ctx.component_order_items:
        out[int(oi.id)] = BundleOperationalUxMeta(
            bundle_id=int(ctx.bundle_id),
            bundle_name=str(ctx.bundle_name),
            bundle_mode=ON_DEMAND_ASSEMBLY,
            bundle_component_index=idx,
            bundle_component_count=len(ctx.component_order_items),
            is_bundle_component=True,
            parent_bundle_order_line_id=parent_id,
        )
        idx += 1
    return out


def _stock_bundle(*, ean: str = "5901234567890", sku: str = "BND-STOCK") -> Bundle:
    return Bundle(
        id=7,
        tenant_id=1,
        name="Promo STOCK",
        sku=sku,
        ean=ean,
        active=True,
        bundle_fulfillment_mode=STOCK_PRODUCTION,
        linked_product_id=103,
    )


def _on_demand_bundle(*, ean: str = "5909999999999") -> Bundle:
    return Bundle(
        id=8,
        tenant_id=1,
        name="Promo OD",
        sku="BND-OD",
        ean=ean,
        active=True,
        bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        linked_product_id=None,
    )


class TestBundleInternalCode:
    def test_default_bundle_id_code(self) -> None:
        b = Bundle(id=42, tenant_id=1, name="X")
        assert bundle_internal_code(b) == "BUNDLE-42"

    def test_metadata_internal_code(self) -> None:
        b = Bundle(id=1, tenant_id=1, metadata_json=json.dumps({"internal_code": "PKG-2026"}))
        assert bundle_internal_code(b) == "PKG-2026"


class TestResolveBundleBarcode:
    def test_empty_returns_none(self) -> None:
        db = MagicMock()
        assert resolve_bundle_barcode(db, tenant_id=1, barcode="  ") is None

    @patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=55)
    def test_product_ean_without_stock_bundle(self, _mock: MagicMock) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        m = resolve_bundle_barcode(db, tenant_id=1, barcode="5901111111111")
        assert m is not None
        assert m.match_kind == "product_ean"
        assert m.product_id == 55
        assert m.bundle_id is None

    @patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=103)
    def test_product_ean_maps_stock_bundle(self, _mock: MagicMock) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = _stock_bundle()
        m = resolve_bundle_barcode(db, tenant_id=1, barcode="5901234567890")
        assert m is not None
        assert m.is_stock_logistic_sku is True
        assert m.bundle_id == 7
        assert m.product_id == 103

    def test_bundle_ean_match(self) -> None:
        db = MagicMock()
        b = _on_demand_bundle(ean="5908888888888")
        chain = db.query.return_value.filter.return_value
        chain.first.return_value = b
        with patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=None):
            m = resolve_bundle_barcode(db, tenant_id=1, barcode="5908888888888")
        assert m is not None
        assert m.match_kind == "bundle_ean"
        assert m.bundle_id == 8

    def test_bundle_sku_match(self) -> None:
        db = MagicMock()
        b = _on_demand_bundle()
        chain = db.query.return_value.filter.return_value
        chain.first.return_value = b
        with patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=None):
            m = resolve_bundle_barcode(db, tenant_id=1, barcode="BND-OD")
        assert m is not None
        assert m.match_kind == "bundle_sku"

    def test_internal_code_bundle_prefix(self) -> None:
        db = MagicMock()
        b = _on_demand_bundle()
        chain = db.query.return_value.filter.return_value
        chain.first.return_value = None
        chain.all.return_value = []
        with patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=None):
            with patch(
                "backend.services.bundles.bundle_barcode_resolver._bundle_by_id_from_internal",
                return_value=b,
            ):
                m = resolve_bundle_barcode(db, tenant_id=1, barcode="BUNDLE-8")
        assert m is not None
        assert m.match_kind == "bundle_internal_code"
        assert m.bundle_id == 8

    def test_whitespace_normalized(self) -> None:
        db = MagicMock()
        b = _stock_bundle()
        db.query.return_value.filter.return_value.first.return_value = b
        with patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=103):
            m = resolve_bundle_barcode(db, tenant_id=1, barcode=" 5901234567890 ")
        assert m is not None
        assert m.barcode == "5901234567890"

    def test_unknown_code_returns_none(self) -> None:
        db = MagicMock()
        chain = db.query.return_value.filter.return_value
        chain.first.return_value = None
        chain.all.return_value = []
        with patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=None):
            with patch(
                "backend.services.bundles.bundle_barcode_resolver._bundle_by_id_from_internal",
                return_value=None,
            ):
                assert resolve_bundle_barcode(db, tenant_id=1, barcode="UNKNOWN") is None


class TestPickingBundleScan:
    def test_not_found(self) -> None:
        db = MagicMock()
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=None):
            r = handle_picking_bundle_scan(
                db,
                tenant_id=1,
                warehouse_id=1,
                barcode="X",
                cart_id=1,
                source_status_id=1,
                order_type="all",
                location_id=None,
                sum_pick_fn=lambda *_a, **_k: 0.0,
            )
        assert r.found is False

    def test_stock_returns_pick_action(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        db = MagicMock()
        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="EAN",
            bundle_id=7,
            bundle_name="Promo",
            bundle_fulfillment_mode=STOCK_PRODUCTION,
            product_id=103,
            is_stock_logistic_sku=True,
        )
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            r = handle_picking_bundle_scan(
                db,
                tenant_id=1,
                warehouse_id=1,
                barcode="EAN",
                cart_id=1,
                source_status_id=1,
                order_type="all",
                location_id=None,
                sum_pick_fn=lambda *_a, **_k: 0.0,
            )
        assert r.action == "pick_stock_line"
        assert r.product_id == 103

    def test_on_demand_shows_missing_components(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        ctx = _ctx_on_demand()
        db = MagicMock()
        order = Order(id=100, items=list(ctx.component_order_items))
        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="OD",
            bundle_id=7,
            bundle_name="Promo",
            bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        )

        def _query(model):
            q = MagicMock()
            if model is Order:
                q.options.return_value.filter.return_value.first.return_value = order
            return q

        db.query.side_effect = _query

        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
                return_value=[100],
            ):
                with patch(
                    "backend.services.bundles.bundle_scan_service.bundle_line_resolver"
                ) as blr:
                    blr.resolve_for_order.return_value = [ctx]
                    with patch(
                        "backend.services.bundles.bundle_scan_service.build_bundle_ux_index_for_order",
                        return_value=_ux_index_for_on_demand(ctx),
                    ):
                        r = handle_picking_bundle_scan(
                        db,
                        tenant_id=1,
                        warehouse_id=1,
                        barcode="OD",
                        cart_id=1,
                        source_status_id=1,
                        order_type="all",
                        location_id=None,
                        sum_pick_fn=lambda *_a, **_k: 0.0,
                    )
        assert r.action == "show_missing_components"
        assert len(r.missing_components) == 2
        assert r.missing_components[0].pick_done is False

    def test_on_demand_no_auto_pick_message(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="OD",
            bundle_id=7,
            bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        )
        db = MagicMock()
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
                return_value=[],
            ):
                r = handle_picking_bundle_scan(
                    db,
                    tenant_id=1,
                    warehouse_id=1,
                    barcode="OD",
                    cart_id=1,
                    source_status_id=1,
                    order_type="all",
                    location_id=None,
                    sum_pick_fn=lambda *_a, **_k: 0.0,
                )
        assert "bez auto-zaliczania" in (r.message or "")


class TestPackingBundleScan:
    def test_stock_pack_line(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        oi = OrderItem(id=60, order_id=100, product_id=103, quantity=2)
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = oi
        match = BundleBarcodeMatch(
            match_kind="product_ean",
            barcode="EAN",
            bundle_id=7,
            bundle_fulfillment_mode=STOCK_PRODUCTION,
            product_id=103,
            is_stock_logistic_sku=True,
        )
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            r = handle_packing_bundle_scan(db, tenant_id=1, order_id=100, barcode="EAN")
        assert r.action == "pack_stock_line"
        assert r.order_item_id == 60

    def test_on_demand_all_picked_verified(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        c1 = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        c1.wms_picking_line_status = "picked"
        c2 = _component_item(oid=52, pid=102, parent_id=50, qty=2)
        c2.wms_picking_line_status = "picked"
        order = Order(id=100, items=[parent, c1, c2])
        tree = SimpleNamespace(bundle_id=7, parent_order_line_id=50, components=())

        db = MagicMock()

        def _query(model):
            q = MagicMock()
            if model is Order:
                q.options.return_value.filter.return_value.first.return_value = order
            return q

        db.query.side_effect = _query
        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="OD",
            bundle_id=7,
            bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        )
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.bundles.bundle_scan_service.bundle_lot_tree_for_order",
                return_value=[tree],
            ):
                r = handle_packing_bundle_scan(db, tenant_id=1, order_id=100, barcode="OD")
        assert r.bundle_verified is True
        assert r.action == "verify_bundle"

    def test_on_demand_incomplete_components(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        c1 = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        c1.wms_picking_line_status = "picked"
        c2 = _component_item(oid=52, pid=102, parent_id=50, qty=2)
        c2.wms_picking_line_status = "pending"
        order = Order(id=100, items=[parent, c1, c2])
        tree = SimpleNamespace(bundle_id=7, parent_order_line_id=50, components=())

        db = MagicMock()

        def _query(model):
            q = MagicMock()
            if model is Order:
                q.options.return_value.filter.return_value.first.return_value = order
            return q

        db.query.side_effect = _query
        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="OD",
            bundle_id=7,
            bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        )
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.bundles.bundle_scan_service.bundle_lot_tree_for_order",
                return_value=[tree],
            ):
                r = handle_packing_bundle_scan(db, tenant_id=1, order_id=100, barcode="OD")
        assert r.bundle_verified is False
        assert r.action == "components_incomplete"


class TestReturnsComplaintsScan:
    def test_returns_opens_rmz_tree(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.distinct.return_value.limit.return_value.all.return_value = [
            (100,),
            (101,),
        ]
        match = BundleBarcodeMatch(match_kind="bundle_ean", barcode="E", bundle_id=7, bundle_name="P")
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            r = handle_returns_bundle_scan(db, tenant_id=1, warehouse_id=1, barcode="E")
        assert r.action == "open_rmz_tree"
        assert r.return_tree_order_ids == [100, 101]

    def test_returns_not_found(self) -> None:
        db = MagicMock()
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=None):
            r = handle_returns_bundle_scan(db, tenant_id=1, warehouse_id=1, barcode="X")
        assert r.found is False

    def test_complaints_traceability_links(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        comp = SimpleNamespace(lots=[{"lot_number": "LOT-1"}])
        tree = SimpleNamespace(bundle_id=7, components=[comp])
        db = MagicMock()
        db.query.return_value.join.return_value.filter.return_value.distinct.return_value.limit.return_value.all.return_value = [
            (200,),
        ]
        match = BundleBarcodeMatch(match_kind="bundle_ean", barcode="E", bundle_id=7, bundle_name="P")
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.bundles.bundle_scan_service.bundle_lot_tree_for_order",
                return_value=[tree],
            ):
                r = handle_complaint_bundle_scan(db, tenant_id=1, warehouse_id=1, barcode="E")
        assert r.action == "open_complaint_traceability"
        assert "bundle_lots" in r.traceability_links
        assert r.traceability_links.get("recall_report") is not None


class TestBulkStockScan:
    def test_each_scan_pick_stock_line(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        match = BundleBarcodeMatch(
            match_kind="product_ean",
            barcode="E",
            bundle_id=7,
            bundle_fulfillment_mode=STOCK_PRODUCTION,
            product_id=103,
            is_stock_logistic_sku=True,
        )
        r1 = bulk_stock_pick_scan_result(scan_index=1, total_scans=20, match=match)
        r20 = bulk_stock_pick_scan_result(scan_index=20, total_scans=20, match=match)
        assert r1.action == "pick_stock_line"
        assert "1/20" in (r1.message or "")
        assert "complete" in (r20.message or "")

    def test_bulk_quantity_one_per_scan(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        match = BundleBarcodeMatch(
            match_kind="product_ean",
            barcode="E",
            bundle_id=7,
            bundle_fulfillment_mode=STOCK_PRODUCTION,
            product_id=103,
            is_stock_logistic_sku=True,
        )
        r = bulk_stock_pick_scan_result(scan_index=5, total_scans=10, match=match)
        assert r.quantity == 1.0


class TestWaveAggregation:
    def test_skip_commercial_header(self) -> None:
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        assert wave_aggregate_product_id_for_line(parent) == 0

    def test_component_product_id(self) -> None:
        comp = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        assert wave_aggregate_product_id_for_line(comp) == 101

    def test_mode_stock_bundle_sku(self) -> None:
        parent = _parent_item(mode=STOCK_PRODUCTION, product_id=103)
        comp = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        assert wave_aggregate_mode_for_order_items([parent, comp]) == "stock_bundle_sku"

    def test_mode_on_demand_components(self) -> None:
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        comp = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        assert wave_aggregate_mode_for_order_items([parent, comp]) == "on_demand_components"

    def test_wave_lines_aggregate_qty(self) -> None:
        parent = _parent_item(mode=ON_DEMAND_ASSEMBLY)
        c1 = _component_item(oid=51, pid=101, parent_id=50, qty=4)
        c2 = _component_item(oid=52, pid=102, parent_id=50, qty=2)
        order = Order(id=100, items=[parent, c1, c2])
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = order
        lines = wave_aggregate_lines(db, 100)
        assert lines[101] == 4.0
        assert lines[102] == 2.0
        assert 103 not in lines


class TestConsolidationRack:
    def test_stock_finished_bundle_row(self) -> None:
        ctx = _ctx_stock()
        b = _stock_bundle()
        ctx.parent_order_item.source_bundle = b
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = Order(id=100, number="ORD-1")
        with patch(
            "backend.services.bundles.bundle_consolidation_view.bundle_line_resolver"
        ) as blr:
            blr.resolve_for_order.return_value = [ctx]
            rows = consolidation_rack_bundle_rows(db, order_id=100, shelf_label="RK-A")
        assert len(rows) == 1
        assert rows[0].display_mode == "stock_finished_bundle"
        assert rows[0].fulfillment_mode == STOCK_PRODUCTION
        assert rows[0].shelf_label == "RK-A"

    def test_on_demand_component_rows(self) -> None:
        ctx = _ctx_on_demand()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = Order(id=100, number="ORD-2")
        with patch(
            "backend.services.bundles.bundle_consolidation_view.bundle_line_resolver"
        ) as blr:
            blr.resolve_for_order.return_value = [ctx]
            rows = consolidation_rack_bundle_rows(db, order_id=100)
        assert len(rows) == 2
        assert all(r.display_mode == "on_demand_component" for r in rows)

    def test_missing_order_empty(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        assert consolidation_rack_bundle_rows(db, order_id=999) == []


class TestLogisticUnit:
    def test_place_cart(self) -> None:
        db = MagicMock()
        row = place_bundle_logistic_unit(
            db,
            tenant_id=1,
            warehouse_id=1,
            bundle_id=7,
            linked_product_id=103,
            quantity=2.0,
            placement_type=PLACEMENT_CART,
            cart_id=5,
        )
        assert row.status == BUNDLE_LOGISTIC_UNIT_STATUS
        assert row.placement_type == PLACEMENT_CART
        db.add.assert_called_once()

    def test_list_by_warehouse(self) -> None:
        unit = SimpleNamespace(
            id=1,
            bundle_id=7,
            linked_product_id=103,
            quantity=1.0,
            placement_type=PLACEMENT_LOCATION,
            status=BUNDLE_LOGISTIC_UNIT_STATUS,
            cart_id=None,
            carrier_id=None,
            location_id=10,
            order_id=None,
        )
        db = MagicMock()
        chain = MagicMock()
        db.query.return_value.filter.return_value = chain
        chain.filter.return_value = chain
        chain.order_by.return_value.all.return_value = [unit]
        rows = list_logistic_units_for_warehouse(db, tenant_id=1, warehouse_id=1, bundle_id=7)
        assert len(rows) == 1

    @pytest.mark.parametrize(
        "placement",
        [PLACEMENT_CART, PLACEMENT_CARRIER, PLACEMENT_PALLET, PLACEMENT_LOCATION],
    )
    def test_all_placement_types(self, placement: str) -> None:
        db = MagicMock()
        row = place_bundle_logistic_unit(
            db,
            tenant_id=1,
            warehouse_id=1,
            bundle_id=7,
            linked_product_id=103,
            quantity=1.0,
            placement_type=placement,
        )
        assert row.placement_type == placement


class TestTraceabilityIntegration:
    def test_picking_includes_traceability_when_order_found(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        ctx = _ctx_on_demand()
        order = Order(id=100, items=list(ctx.component_order_items))
        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="OD",
            bundle_id=7,
            bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        )
        db = MagicMock()

        def _query(model):
            q = MagicMock()
            if model is Order:
                q.options.return_value.filter.return_value.first.return_value = order
            return q

        db.query.side_effect = _query
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.wms_picking_product_list_service.resolve_wms_picking_order_ids",
                return_value=[100],
            ):
                with patch(
                    "backend.services.bundles.bundle_scan_service.bundle_line_resolver"
                ) as blr:
                    blr.resolve_for_order.return_value = [ctx]
                    with patch(
                        "backend.services.bundles.bundle_scan_service.build_bundle_ux_index_for_order",
                        return_value=_ux_index_for_on_demand(ctx),
                    ):
                        r = handle_picking_bundle_scan(
                            db,
                            tenant_id=1,
                            warehouse_id=1,
                            barcode="OD",
                            cart_id=1,
                            source_status_id=1,
                            order_type="all",
                            location_id=None,
                            sum_pick_fn=lambda *_a, **_k: 0.0,
                        )
        assert "bundle_lots" in r.traceability_links

    def test_packing_not_found(self) -> None:
        db = MagicMock()
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=None):
            r = handle_packing_bundle_scan(db, tenant_id=1, order_id=100, barcode="X")
        assert r.found is False

    def test_complaints_not_found(self) -> None:
        db = MagicMock()
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=None):
            r = handle_complaint_bundle_scan(db, tenant_id=1, warehouse_id=1, barcode="X")
        assert r.found is False

    def test_wave_lines_missing_order(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None
        assert wave_aggregate_lines(db, 404) == {}

    def test_stock_bundle_fulfillment_mode(self) -> None:
        b = _stock_bundle()
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = b
        with patch("backend.services.bundles.bundle_barcode_resolver.resolve_product_id", return_value=None):
            m = resolve_bundle_barcode(db, tenant_id=1, barcode="5901234567890")
        assert m is not None
        assert m.bundle_fulfillment_mode == STOCK_PRODUCTION
        assert m.is_stock_logistic_sku is True

    def test_packing_traceability_links(self) -> None:
        from backend.services.bundles.bundle_barcode_resolver import BundleBarcodeMatch

        tree = SimpleNamespace(bundle_id=7, parent_order_line_id=50, components=())
        match = BundleBarcodeMatch(
            match_kind="bundle_ean",
            barcode="OD",
            bundle_id=7,
            bundle_fulfillment_mode=ON_DEMAND_ASSEMBLY,
        )
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.first.return_value = None
        with patch("backend.services.bundles.bundle_scan_service.resolve_bundle_barcode", return_value=match):
            with patch(
                "backend.services.bundles.bundle_scan_service.bundle_lot_tree_for_order",
                return_value=[tree],
            ):
                r = handle_packing_bundle_scan(db, tenant_id=1, order_id=100, barcode="OD")
        assert "returns_tree" in r.traceability_links
