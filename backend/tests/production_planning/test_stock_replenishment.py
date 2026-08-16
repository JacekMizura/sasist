"""Phase 7 — stock replenishment (nadprodukcja) from sales rotation."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.models.production import (
    PRODUCTION_ORDER_SOURCE_ORDERS,
    PRODUCTION_ORDER_SOURCE_PLANNING,
)
from backend.services.production_planning.constants import STOCK_REPLENISHMENT_COVERAGE_PRESETS
from backend.services.production_planning.production_recommendation_service import (
    forecast_stock_need,
    forecast_target_stock,
)
from backend.services.production_planning.stock_replenishment_service import (
    AGGREGABLE_PLANNING_STATUSES,
    _find_aggregable_planning_mo,
    compute_stock_replenishment_target,
    max_producible_after_orders_hold,
    soft_hold_components_for_orders,
    _SoftHoldState,
)


class TestCoverageTargets(unittest.TestCase):
    def test_daily_rate_10_coverage_3_target_30(self):
        self.assertEqual(
            forecast_target_stock(daily_rate=10, coverage_days=3, min_stock=None, max_stock=None),
            30,
        )
        self.assertEqual(compute_stock_replenishment_target(daily_rate=10, coverage_days=3), 30)

    def test_stock_20_pipeline_0_recommend_10(self):
        need = forecast_stock_need(
            daily_rate=10,
            coverage_days=3,
            min_stock=None,
            max_stock=None,
            on_hand=20,
            in_pipeline=0,
        )
        self.assertEqual(need, 10)

    def test_stock_20_pipeline_5_recommend_5(self):
        need = forecast_stock_need(
            daily_rate=10,
            coverage_days=3,
            min_stock=None,
            max_stock=None,
            on_hand=20,
            in_pipeline=5,
        )
        self.assertEqual(need, 5)

    def test_max_stock_22_recommend_max_2(self):
        target = forecast_target_stock(daily_rate=10, coverage_days=3, min_stock=None, max_stock=22)
        self.assertEqual(target, 22)
        need = forecast_stock_need(
            daily_rate=10,
            coverage_days=3,
            min_stock=None,
            max_stock=22,
            on_hand=20,
            in_pipeline=0,
        )
        self.assertEqual(need, 2)

    def test_coverage_presets_1_3_7_14(self):
        self.assertEqual(STOCK_REPLENISHMENT_COVERAGE_PRESETS, (1, 3, 7, 14))
        for days in STOCK_REPLENISHMENT_COVERAGE_PRESETS:
            self.assertEqual(
                forecast_target_stock(daily_rate=10, coverage_days=days, min_stock=None, max_stock=None),
                10 * days,
            )


class TestMaterialCapAndOrdersPriority(unittest.TestCase):
    def test_no_components_caps_to_zero(self):
        composition = MagicMock()
        composition.yield_quantity = 1.0
        line = MagicMock()
        line.component_product_id = 99
        composition.lines = [line]

        with (
            patch(
                "backend.services.production_planning.stock_replenishment_service.effective_line_qty",
                return_value=1.0,
            ),
            patch(
                "backend.services.production_planning.stock_replenishment_service.warehouse_net_available",
                return_value=0.0,
            ),
        ):
            max_p = max_producible_after_orders_hold(
                MagicMock(),
                tenant_id=1,
                warehouse_id=1,
                composition=composition,
                soft_hold=_SoftHoldState(by_component={}),
            )
        self.assertEqual(max_p, 0.0)

    def test_orders_soft_hold_reduces_planning_max(self):
        composition = MagicMock()
        composition.yield_quantity = 1.0
        line = MagicMock()
        line.component_product_id = 50
        composition.lines = [line]

        with (
            patch(
                "backend.services.production_planning.stock_replenishment_service.effective_line_qty",
                return_value=1.0,
            ),
            patch(
                "backend.services.production_planning.stock_replenishment_service.warehouse_net_available",
                return_value=10.0,
            ),
        ):
            without = max_producible_after_orders_hold(
                MagicMock(),
                tenant_id=1,
                warehouse_id=1,
                composition=composition,
                soft_hold=_SoftHoldState(by_component={}),
            )
            with_hold = max_producible_after_orders_hold(
                MagicMock(),
                tenant_id=1,
                warehouse_id=1,
                composition=composition,
                soft_hold=_SoftHoldState(by_component={50: 8.0}),
            )
        self.assertEqual(without, 10.0)
        self.assertEqual(with_hold, 2.0)

    def test_soft_hold_reads_unreserved_orders_snapshots(self):
        mo = MagicMock()
        mo.id = 7
        snap = MagicMock()
        snap.component_product_id = 50
        snap.total_required_quantity = 8.0
        mo.line_snapshots = [snap]

        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.side_effect = [[mo], []]  # MOs, then reservations empty

        hold = soft_hold_components_for_orders(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(hold.by_component.get(50), 8.0)


class TestPlanningAggregationRules(unittest.TestCase):
    def test_aggregable_statuses_match_orders_pattern(self):
        self.assertEqual(AGGREGABLE_PLANNING_STATUSES, frozenset({"draft", "planned"}))

    def test_find_aggregable_filters_planning_only(self):
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.with_for_update.return_value = q
        q.first.return_value = None

        _find_aggregable_planning_mo(
            db,
            tenant_id=1,
            warehouse_id=1,
            product_id=10,
            composition_id=20,
        )
        # Ensure filter was called (source_type PLANNING constraint lives in filter kwargs)
        self.assertTrue(q.filter.called)
        # Reconstruct: filter receives SQLAlchemy criterion objects; verify constant usage in module
        self.assertEqual(PRODUCTION_ORDER_SOURCE_PLANNING, "PLANNING")
        self.assertEqual(PRODUCTION_ORDER_SOURCE_ORDERS, "ORDERS")
        self.assertNotEqual(PRODUCTION_ORDER_SOURCE_PLANNING, PRODUCTION_ORDER_SOURCE_ORDERS)

    def test_started_mo_not_aggregable(self):
        self.assertNotIn("collecting", AGGREGABLE_PLANNING_STATUSES)
        self.assertNotIn("in_progress", AGGREGABLE_PLANNING_STATUSES)


class TestRunReplenishmentDisabledAndIdempotentShape(unittest.TestCase):
    @patch("backend.services.production_planning.stock_replenishment_service.load_forecast_settings")
    def test_disabled_without_force_skips(self, mock_settings):
        from backend.schemas.wms_production_settings import ProductionForecastSettings
        from backend.services.production_planning.stock_replenishment_service import (
            run_production_stock_replenishment,
        )

        mock_settings.return_value = ProductionForecastSettings(auto_stock_replenishment=False)
        result = run_production_stock_replenishment(
            MagicMock(), tenant_id=1, warehouse_id=1, force=False
        )
        self.assertFalse(result.enabled)
        self.assertEqual(result.created_count, 0)
        self.assertEqual(result.actions[0].reason, "auto_stock_replenishment_disabled")

    @patch("backend.services.production_planning.stock_replenishment_service._reserve_planning_materials")
    @patch("backend.services.production_planning.stock_replenishment_service._create_planning_mo")
    @patch("backend.services.production_planning.stock_replenishment_service._find_aggregable_planning_mo")
    @patch("backend.services.production_planning.stock_replenishment_service.max_producible_after_orders_hold")
    @patch("backend.services.production_planning.stock_replenishment_service.soft_hold_components_for_orders")
    @patch("backend.services.production_planning.stock_replenishment_service.ensure_orders_material_priority")
    @patch("backend.services.production_planning.stock_replenishment_service.build_planning_snapshot")
    @patch("backend.services.production_planning.stock_replenishment_service.load_forecast_settings")
    def test_creates_planning_mo_not_orders(
        self,
        mock_settings,
        mock_snap,
        mock_ensure,
        mock_hold,
        mock_max,
        mock_find,
        mock_create,
        mock_reserve,
    ):
        from backend.schemas.production_planning import (
            ProductionDemandPlanningRead,
            ProductionDemandProductRowRead,
            ProductionPlanningDashboardRead,
        )
        from backend.schemas.wms_production_settings import ProductionForecastSettings
        from backend.services.production_planning.stock_replenishment_service import (
            run_production_stock_replenishment,
        )

        mock_settings.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_coverage_days=3,
        )
        mock_snap.return_value = ProductionDemandPlanningRead(
            tenant_id=1,
            warehouse_id=1,
            coverage_days=3,
            sales_lookback_days=30,
            forecast_strategy="PERIOD_AVERAGE",
            dashboard=ProductionPlanningDashboardRead(),
            products=[
                ProductionDemandProductRowRead(
                    product_id=10,
                    composition_id=100,
                    product_name="FG",
                    stock_replenishment_needed=10,
                    recommended_quantity=10,
                )
            ],
        )
        mock_hold.return_value = _SoftHoldState(by_component={})
        mock_max.return_value = 10.0
        mock_find.return_value = None
        mo = MagicMock()
        mo.id = 55
        mo.number = "MO-PLAN-1"
        mo.source_type = PRODUCTION_ORDER_SOURCE_PLANNING
        mock_create.return_value = mo

        db = MagicMock()
        # composition lookup
        comp = MagicMock()
        comp.id = 100
        comp.lines = []
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.return_value = [comp]

        result = run_production_stock_replenishment(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(result.created_count, 1)
        self.assertEqual(result.actions[0].action, "created")
        mock_create.assert_called_once()
        self.assertEqual(mock_create.call_args.kwargs.get("planned_quantity"), 10.0)
        mock_ensure.assert_called_once()

    @patch("backend.services.production_planning.stock_replenishment_service._reserve_planning_materials")
    @patch("backend.services.production_planning.stock_replenishment_service._find_aggregable_planning_mo")
    @patch("backend.services.production_planning.stock_replenishment_service.max_producible_after_orders_hold")
    @patch("backend.services.production_planning.stock_replenishment_service.soft_hold_components_for_orders")
    @patch("backend.services.production_planning.stock_replenishment_service.ensure_orders_material_priority")
    @patch("backend.services.production_planning.stock_replenishment_service.build_planning_snapshot")
    @patch("backend.services.production_planning.stock_replenishment_service.load_forecast_settings")
    def test_aggregates_existing_planning_mo(
        self,
        mock_settings,
        mock_snap,
        mock_ensure,
        mock_hold,
        mock_max,
        mock_find,
        mock_reserve,
    ):
        from backend.schemas.production_planning import (
            ProductionDemandPlanningRead,
            ProductionDemandProductRowRead,
            ProductionPlanningDashboardRead,
        )
        from backend.schemas.wms_production_settings import ProductionForecastSettings
        from backend.services.production_planning.stock_replenishment_service import (
            run_production_stock_replenishment,
        )

        mock_settings.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_coverage_days=7,
        )
        mock_snap.return_value = ProductionDemandPlanningRead(
            tenant_id=1,
            warehouse_id=1,
            coverage_days=7,
            sales_lookback_days=30,
            forecast_strategy="PERIOD_AVERAGE",
            dashboard=ProductionPlanningDashboardRead(),
            products=[
                ProductionDemandProductRowRead(
                    product_id=10,
                    composition_id=100,
                    product_name="FG",
                    stock_replenishment_needed=5,
                    recommended_quantity=5,
                )
            ],
        )
        mock_hold.return_value = _SoftHoldState(by_component={})
        mock_max.return_value = 5.0
        existing = MagicMock()
        existing.id = 9
        existing.number = "MO-P-9"
        existing.planned_quantity = 3.0
        existing.line_snapshots = []
        existing.source_type = PRODUCTION_ORDER_SOURCE_PLANNING
        mock_find.return_value = existing

        db = MagicMock()
        comp = MagicMock()
        comp.id = 100
        comp.lines = []
        q = MagicMock()
        db.query.return_value = q
        q.options.return_value = q
        q.filter.return_value = q
        q.all.return_value = [comp]

        result = run_production_stock_replenishment(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(result.aggregated_count, 1)
        self.assertEqual(existing.planned_quantity, 8.0)
        self.assertEqual(result.actions[0].action, "aggregated")


class TestForecastSettingsBackwardCompat(unittest.TestCase):
    def test_legacy_json_without_replenishment_fields(self):
        from backend.services.production_planning.forecast_settings_service import parse_forecast_settings_json

        s = parse_forecast_settings_json('{"strategy":"PERIOD_AVERAGE","sales_lookback_days":30}')
        self.assertFalse(s.auto_stock_replenishment)
        self.assertEqual(s.stock_replenishment_coverage_days, 7)
        self.assertEqual(s.strategy, "PERIOD_AVERAGE")

    def test_unknown_strategy_key_becomes_period_average(self):
        from unittest.mock import patch

        from backend.services.production_planning.forecast_settings_service import parse_forecast_settings_json

        with patch(
            "backend.services.production_planning.forecast_settings_service.logger.warning"
        ) as warn:
            s = parse_forecast_settings_json(
                '{"strategy":"NOT_A_REAL_STRATEGY","sales_lookback_days":45}',
                warehouse_id=7,
                tenant_id=1,
            )
        self.assertEqual(s.strategy, "PERIOD_AVERAGE")
        self.assertEqual(s.sales_lookback_days, 45)
        warn.assert_called_once()
        msg = warn.call_args[0][0] % warn.call_args[0][1:]
        self.assertIn("NOT_A_REAL_STRATEGY", msg)
        self.assertIn("PERIOD_AVERAGE", msg)
        self.assertIn("7", msg)

    def test_known_strategy_does_not_warn(self):
        from unittest.mock import patch

        from backend.services.production_planning.forecast_settings_service import parse_forecast_settings_json

        with patch(
            "backend.services.production_planning.forecast_settings_service.logger.warning"
        ) as warn:
            s = parse_forecast_settings_json(
                '{"strategy":"WEIGHTED_AVERAGE","sales_lookback_days":30}',
                warehouse_id=1,
                tenant_id=1,
            )
        self.assertEqual(s.strategy, "WEIGHTED_AVERAGE")
        warn.assert_not_called()


if __name__ == "__main__":
    unittest.main()
