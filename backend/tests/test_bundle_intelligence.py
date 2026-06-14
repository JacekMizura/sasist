"""P4.18 — Bundle warehouse intelligence (analytics, slotting, replenishment, capacity)."""

from __future__ import annotations

from datetime import datetime, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.models.bundle import Bundle, BundleItem
from backend.models.cart import Cart
from backend.models.consolidation_rack import ConsolidationRack
from backend.models.order import Order
from backend.models.order_item import OrderItem
from backend.models.product import Product
from backend.services.bundles.intelligence.analytics_service import (
    BundleKpiRow,
    _margin_for_parent,
    build_bundle_dashboard,
)
from backend.services.bundles.intelligence.capacity_service import build_bundle_capacity_report
from backend.services.bundles.intelligence.replenishment_service import build_bundle_replenishment_forecast
from backend.services.bundles.intelligence.slotting_service import build_bundle_slotting_recommendations


def _bundle(*, bid: int = 1, name: str = "Promo Pack", items: list[BundleItem] | None = None) -> Bundle:
    b = Bundle(id=bid, tenant_id=1, name=name, active=True, deleted_at=None)
    b.items = items or []
    return b


def _bundle_item(*, pid: int, qty: float = 1.0) -> BundleItem:
    return BundleItem(id=pid, bundle_id=1, product_id=pid, quantity=qty)


class TestMarginForParent:
    def test_no_components_returns_none(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []
        parent = OrderItem(id=10, total_price=100.0, quantity=1)
        assert _margin_for_parent(db, parent) == (None, None)

    def test_margin_from_components(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(purchase_price_net_snapshot=20.0, quantity_total=2),
        ]
        parent = OrderItem(id=10, total_price=100.0, quantity=1)
        margin, pct = _margin_for_parent(db, parent)
        assert margin == 60.0
        assert pct == 60.0


class TestBuildBundleDashboard:
    @patch("backend.services.bundles.intelligence.analytics_service._aggregate_kpis")
    def test_dashboard_lists_sorted(self, mock_agg: MagicMock) -> None:
        rows = {
            1: BundleKpiRow(
                bundle_id=1,
                bundle_name="A",
                units_sold=100,
                revenue_net=1000,
                margin_net=200,
                margin_percent=20,
                returns_count=5,
                complaints_count=1,
                avg_pick_seconds=30,
                avg_pack_seconds=60,
                avg_consolidation_seconds=120,
                growth_percent=50,
            ),
            2: BundleKpiRow(
                bundle_id=2,
                bundle_name="B",
                units_sold=50,
                revenue_net=500,
                margin_net=300,
                margin_percent=60,
                returns_count=10,
                complaints_count=0,
                avg_pick_seconds=None,
                avg_pack_seconds=None,
                avg_consolidation_seconds=None,
                growth_percent=10,
            ),
        }
        mock_agg.return_value = rows
        db = MagicMock()
        dash = build_bundle_dashboard(db, tenant_id=1, warehouse_id=1, period_days=30, list_limit=5)
        assert dash.period_days == 30
        assert dash.top_bundles[0].bundle_id == 1
        assert dash.highest_margin[0].bundle_id == 2
        assert dash.most_returns[0].bundle_id == 2
        assert dash.fastest_growing[0].growth_percent == 50


class TestBuildBundleSlotting:
    def test_co_occurrence_recommendation(self) -> None:
        db = MagicMock()
        b1 = _bundle(
            bid=1,
            items=[_bundle_item(pid=10, qty=1), _bundle_item(pid=20, qty=1)],
        )
        b2 = _bundle(
            bid=2,
            items=[_bundle_item(pid=10, qty=1), _bundle_item(pid=20, qty=1), _bundle_item(pid=30, qty=1)],
        )
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b1, b2]

        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [
            Product(id=10, name="Dezodorant", sku="DEZ-1"),
            Product(id=20, name="Szampon", sku="SZA-1"),
            Product(id=30, name="Mydło", sku="MYD-1"),
        ]

        slot_q = MagicMock()
        slot_q.filter.return_value.order_by.return_value.first.side_effect = [
            SimpleNamespace(location_uuid="LOC-A"),
            SimpleNamespace(location_uuid="LOC-B"),
            SimpleNamespace(location_uuid="LOC-A"),
            SimpleNamespace(location_uuid="LOC-B"),
            SimpleNamespace(location_uuid="LOC-A"),
            SimpleNamespace(location_uuid="LOC-B"),
        ]

        def query_side(model):
            if model is Bundle:
                return bundle_q
            if model is Product:
                return product_q
            return slot_q

        db.query.side_effect = query_side
        rows = build_bundle_slotting_recommendations(
            db, tenant_id=1, warehouse_id=1, min_co_occurrence_rate=0.5, limit=10
        )
        pair_10_20 = next(r for r in rows if r.product_a_id == 10 and r.product_b_id == 20)
        assert pair_10_20.co_occurrence_rate == 1.0
        assert pair_10_20.bundles_together_count == 2
        assert "sąsiedztwo" in pair_10_20.recommendation.lower()
        assert pair_10_20.priority == "high"

    def test_same_location_low_priority(self) -> None:
        db = MagicMock()
        b = _bundle(bid=1, items=[_bundle_item(pid=10), _bundle_item(pid=20)])
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [
            Product(id=10, name="A", sku=None),
            Product(id=20, name="B", sku=None),
        ]
        slot_q = MagicMock()
        slot_q.filter.return_value.order_by.return_value.first.return_value = SimpleNamespace(
            location_uuid="SAME-LOC"
        )

        def query_side(model):
            if model is Bundle:
                return bundle_q
            if model is Product:
                return product_q
            return slot_q

        db.query.side_effect = query_side
        rows = build_bundle_slotting_recommendations(db, tenant_id=1, warehouse_id=1, min_co_occurrence_rate=0.5)
        assert len(rows) == 1
        assert rows[0].priority == "low"
        assert "Już w tej samej lokalizacji" in rows[0].recommendation


class TestBuildBundleReplenishment:
    @patch(
        "backend.services.bundles.intelligence.replenishment_service._recent_bundle_velocity",
        return_value=70.0,
    )
    def test_velocity_forecast_expands_components(self, _vel: MagicMock) -> None:
        db = MagicMock()
        b = _bundle(
            bid=5,
            name="Hygiene Set",
            items=[_bundle_item(pid=10, qty=2), _bundle_item(pid=20, qty=1)],
        )
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [
            Product(id=10, name="Dezodorant", sku="DEZ"),
            Product(id=20, name="Szampon", sku="SZA"),
        ]
        db.query.side_effect = lambda m: bundle_q if m is Bundle else product_q

        rows = build_bundle_replenishment_forecast(
            db,
            tenant_id=1,
            warehouse_id=1,
            bundle_qty_forecast=None,
            horizon_weeks=1.0,
            velocity_period_days=30,
        )
        assert len(rows) == 2
        dez = next(r for r in rows if r.product_id == 10)
        sha = next(r for r in rows if r.product_id == 20)
        assert dez.qty_per_bundle == 2
        assert sha.qty_per_bundle == 1
        assert dez.total_component_qty == round(dez.bundle_qty_forecast * 2, 2)
        assert "uzupełnij pick-face" in dez.recommendation.lower()

    def test_explicit_forecast_qty(self) -> None:
        db = MagicMock()
        b = _bundle(bid=3, items=[_bundle_item(pid=10, qty=2)])
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [Product(id=10, name="X", sku="X")]
        db.query.side_effect = lambda m: bundle_q if m is Bundle else product_q

        rows = build_bundle_replenishment_forecast(
            db,
            tenant_id=1,
            warehouse_id=1,
            bundle_qty_forecast={3: 100.0},
            horizon_weeks=1.0,
        )
        assert len(rows) == 1
        assert rows[0].bundle_qty_forecast == 100.0
        assert rows[0].total_component_qty == 200.0


class TestBuildBundleCapacity:
    def test_overloaded_cart_recommendation(self) -> None:
        db = MagicMock()
        cart = Cart(id=1, tenant_id=1, warehouse_id=1, total_volume=100, used_volume=90, code="C-01")
        cart_q = MagicMock()
        cart_q.filter.return_value.all.return_value = [cart]
        rack_q = MagicMock()
        rack_q.filter.return_value.all.return_value = []

        order_count_q = MagicMock()
        order_count_q.join.return_value.filter.return_value.scalar.return_value = 2

        def query_side(model):
            if model is Cart:
                return cart_q
            if model is ConsolidationRack:
                return rack_q
            return order_count_q

        db.query.side_effect = query_side
        report = build_bundle_capacity_report(db, tenant_id=1, warehouse_id=1)
        assert len(report.cart_rows) == 1
        assert report.cart_rows[0].utilization_percent == 90.0
        assert report.overloaded_carts == 1
        assert "Przeciążenie" in report.cart_rows[0].recommendation

    def test_rack_segment_with_bundle(self) -> None:
        db = MagicMock()
        cart_q = MagicMock()
        cart_q.filter.return_value.all.return_value = []
        seg = SimpleNamespace(
            order_id=500,
            fill_percent=75.0,
            slot_label="A1",
            segment_index=1,
        )
        level = SimpleNamespace(level_index=1, segments=[seg])
        rack = SimpleNamespace(id=9, name="RK-1", levels=[level])
        rack_q = MagicMock()
        rack_q.filter.return_value.all.return_value = [rack]

        bundle_check_q = MagicMock()
        bundle_check_q.filter.return_value.first.return_value = OrderItem(id=1)

        call_idx = {"n": 0}

        def query_side(model):
            call_idx["n"] += 1
            if model is Cart:
                return cart_q
            if model is ConsolidationRack:
                return rack_q
            return bundle_check_q

        db.query.side_effect = query_side
        report = build_bundle_capacity_report(db, tenant_id=1, warehouse_id=1)
        assert len(report.rack_rows) == 1
        assert report.rack_rows[0].has_bundle is True
        assert report.rack_rows[0].order_id == 500
        assert "Bundle na półce" in report.rack_rows[0].recommendation


class TestBundleIntelligenceSchemas:
    def test_kpi_row_fields(self) -> None:
        row = BundleKpiRow(
            bundle_id=1,
            bundle_name="Test",
            units_sold=10,
            revenue_net=100,
            margin_net=20,
            margin_percent=20,
            returns_count=1,
            complaints_count=0,
            avg_pick_seconds=15,
            avg_pack_seconds=30,
            avg_consolidation_seconds=45,
        )
        assert row.units_sold == 10
        assert row.avg_pick_seconds == 15


class TestBundleParentRowsIntegration:
    @patch("backend.services.bundles.intelligence.analytics_service._bundle_parent_rows")
    @patch("backend.services.bundles.intelligence.analytics_service._margin_for_parent", return_value=(10.0, 10.0))
    def test_aggregate_sums_units(self, _margin: MagicMock, mock_parents: MagicMock) -> None:
        from backend.services.bundles.intelligence.analytics_service import _aggregate_kpis

        oi = OrderItem(
            id=1,
            source_bundle_id=7,
            quantity=3,
            total_price=300,
            is_bundle_parent=True,
        )
        order = Order(id=100, tenant_id=1, warehouse_id=1)
        mock_parents.return_value = [(oi, order)]

        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            Bundle(id=7, tenant_id=1, name="Pack", deleted_at=None),
        ]
        db.query.return_value.filter.return_value.group_by.return_value.all.return_value = []
        db.query.return_value.join.return_value.filter.return_value.group_by.return_value.all.return_value = []
        db.query.return_value.filter.return_value.all.return_value = []

        since = datetime.utcnow() - timedelta(days=30)
        kpis = _aggregate_kpis(db, tenant_id=1, warehouse_id=1, since=since)
        assert kpis[7].units_sold == 3
        assert kpis[7].revenue_net == 300.0


class TestMarginEdgeCases:
    def test_zero_revenue_no_percent(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(purchase_price_net_snapshot=5.0, quantity_total=1),
        ]
        parent = OrderItem(id=1, total_price=0, unit_price=0, quantity=1)
        margin, pct = _margin_for_parent(db, parent)
        assert margin == -5.0
        assert pct is None

    def test_unit_price_fallback(self) -> None:
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = [
            SimpleNamespace(purchase_price_net_snapshot=10.0, quantity_total=1),
        ]
        parent = OrderItem(id=1, total_price=0, unit_price=50.0, quantity=2)
        margin, pct = _margin_for_parent(db, parent)
        assert margin == 90.0
        assert pct == 90.0


class TestSlottingThreshold:
    def test_below_threshold_excluded(self) -> None:
        db = MagicMock()
        b1 = _bundle(bid=1, items=[_bundle_item(pid=10), _bundle_item(pid=20)])
        b2 = _bundle(bid=2, items=[_bundle_item(pid=10), _bundle_item(pid=30)])
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b1, b2]
        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [
            Product(id=10, name="A", sku=None),
            Product(id=20, name="B", sku=None),
            Product(id=30, name="C", sku=None),
        ]
        slot_q = MagicMock()
        slot_q.filter.return_value.order_by.return_value.first.return_value = None
        db.query.side_effect = lambda m: bundle_q if m is Bundle else (product_q if m is Product else slot_q)
        rows = build_bundle_slotting_recommendations(
            db, tenant_id=1, warehouse_id=1, min_co_occurrence_rate=0.99, limit=10
        )
        assert rows == []

    def test_limit_respected(self) -> None:
        db = MagicMock()
        items = [_bundle_item(pid=i) for i in range(1, 5)]
        b = _bundle(bid=1, items=items)
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [Product(id=i, name=f"P{i}", sku=None) for i in range(1, 5)]
        slot_q = MagicMock()
        slot_q.filter.return_value.order_by.return_value.first.return_value = None
        db.query.side_effect = lambda m: bundle_q if m is Bundle else (product_q if m is Product else slot_q)
        rows = build_bundle_slotting_recommendations(db, tenant_id=1, warehouse_id=1, min_co_occurrence_rate=0.5, limit=2)
        assert len(rows) == 2


class TestReplenishmentEdgeCases:
    def test_zero_velocity_skipped(self) -> None:
        db = MagicMock()
        b = _bundle(bid=1, items=[_bundle_item(pid=10)])
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        db.query.side_effect = lambda m: bundle_q if m is Bundle else MagicMock()
        with patch(
            "backend.services.bundles.intelligence.replenishment_service._recent_bundle_velocity",
            return_value=0.0,
        ):
            rows = build_bundle_replenishment_forecast(db, tenant_id=1, warehouse_id=1)
        assert rows == []

    def test_empty_bundle_items_skipped(self) -> None:
        db = MagicMock()
        b = _bundle(bid=1, items=[])
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        db.query.side_effect = lambda m: bundle_q
        rows = build_bundle_replenishment_forecast(
            db, tenant_id=1, warehouse_id=1, bundle_qty_forecast={1: 50.0}
        )
        assert rows == []


class TestCapacityEdgeCases:
    def test_empty_warehouse(self) -> None:
        db = MagicMock()
        cart_q = MagicMock()
        cart_q.filter.return_value.all.return_value = []
        rack_q = MagicMock()
        rack_q.filter.return_value.all.return_value = []
        db.query.side_effect = lambda m: cart_q if m is Cart else rack_q
        report = build_bundle_capacity_report(db, tenant_id=1, warehouse_id=1)
        assert report.cart_rows == []
        assert report.rack_rows == []
        assert report.overloaded_carts == 0

    def test_rack_overload_threshold(self) -> None:
        db = MagicMock()
        cart_q = MagicMock()
        cart_q.filter.return_value.all.return_value = []
        seg = SimpleNamespace(order_id=None, fill_percent=95.0, slot_label="X", segment_index=0)
        level = SimpleNamespace(level_index=0, segments=[seg])
        rack = SimpleNamespace(id=1, name="RK", levels=[level])
        rack_q = MagicMock()
        rack_q.filter.return_value.all.return_value = [rack]
        db.query.side_effect = lambda m: cart_q if m is Cart else rack_q
        report = build_bundle_capacity_report(db, tenant_id=1, warehouse_id=1, rack_fill_threshold=90.0)
        assert report.overloaded_rack_segments == 1
        assert "wysokie wypełnienie" in report.rack_rows[0].recommendation.lower()


class TestDashboardEmpty:
    @patch("backend.services.bundles.intelligence.analytics_service._aggregate_kpis", return_value={})
    def test_empty_dashboard(self, _mock: MagicMock) -> None:
        dash = build_bundle_dashboard(MagicMock(), tenant_id=1, warehouse_id=1)
        assert dash.top_bundles == []
        assert dash.fastest_growing == []


class TestBundleIntelligenceApiImport:
    def test_services_importable(self) -> None:
        from backend.services.bundles.intelligence import analytics_service, capacity_service  # noqa: F401
        from backend.services.bundles.intelligence import replenishment_service, slotting_service  # noqa: F401
        assert callable(analytics_service.build_bundle_dashboard)
        assert callable(slotting_service.build_bundle_slotting_recommendations)
        assert callable(replenishment_service.build_bundle_replenishment_forecast)
        assert callable(capacity_service.build_bundle_capacity_report)

    def test_api_router_prefix(self) -> None:
        from backend.api.bundle_intelligence import router

        assert router.prefix == "/bundles/intelligence"
        paths = {getattr(r, "path", "") for r in router.routes}
        assert "/dashboard" in paths or any("dashboard" in p for p in paths)


class TestKpiRowGrowth:
    def test_growth_percent_field(self) -> None:
        row = BundleKpiRow(
            bundle_id=1,
            bundle_name="X",
            units_sold=20,
            revenue_net=200,
            margin_net=40,
            margin_percent=20,
            returns_count=0,
            complaints_count=0,
            avg_pick_seconds=None,
            avg_pack_seconds=None,
            avg_consolidation_seconds=None,
            growth_percent=150.0,
        )
        assert row.growth_percent == 150.0


class TestReplenishmentSorting:
    @patch(
        "backend.services.bundles.intelligence.replenishment_service._recent_bundle_velocity",
        return_value=14.0,
    )
    def test_sorted_by_total_qty_desc(self, _v: MagicMock) -> None:
        db = MagicMock()
        b = _bundle(
            bid=1,
            items=[_bundle_item(pid=10, qty=1), _bundle_item(pid=20, qty=5)],
        )
        bundle_q = MagicMock()
        bundle_q.filter.return_value.all.return_value = [b]
        product_q = MagicMock()
        product_q.filter.return_value.all.return_value = [
            Product(id=10, name="Low", sku=None),
            Product(id=20, name="High", sku=None),
        ]
        db.query.side_effect = lambda m: bundle_q if m is Bundle else product_q
        rows = build_bundle_replenishment_forecast(db, tenant_id=1, warehouse_id=1)
        assert rows[0].product_id == 20
        assert rows[0].total_component_qty >= rows[1].total_component_qty


class TestCapacityCartMonitoring:
    def test_bundle_cart_monitoring_not_overloaded(self) -> None:
        db = MagicMock()
        cart = Cart(id=2, tenant_id=1, warehouse_id=1, total_volume=100, used_volume=75, code="C-02")
        cart_q = MagicMock()
        cart_q.filter.return_value.all.return_value = [cart]
        rack_q = MagicMock()
        rack_q.filter.return_value.all.return_value = []
        order_count_q = MagicMock()
        order_count_q.join.return_value.filter.return_value.scalar.return_value = 3

        def query_side(model):
            if model is Cart:
                return cart_q
            if model is ConsolidationRack:
                return rack_q
            return order_count_q

        db.query.side_effect = query_side
        report = build_bundle_capacity_report(db, tenant_id=1, warehouse_id=1)
        assert report.overloaded_carts == 0
        assert "monitoruj" in report.cart_rows[0].recommendation.lower()
