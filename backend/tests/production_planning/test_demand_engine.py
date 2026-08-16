"""Unit tests for commercial MRP planning engine — approved §26 methodology."""

from __future__ import annotations

import unittest
from datetime import date, timedelta

from backend.services.production_planning.forecast_strategies import (
    PeriodAverageStrategy,
    WeightedAverageStrategy,
    WeekdayAverageStrategy,
)
from backend.services.production_planning.material_availability_service import cap_by_materials
from backend.services.production_planning.priority_engine import compute_priority
from backend.services.production_planning.production_recommendation_service import (
    apply_moq_and_multiple,
    combined_production_need,
    forecast_stock_need,
    forecast_target_stock,
)


def _history(qtys: list[float]) -> list[tuple[date, float]]:
    start = date.today() - timedelta(days=len(qtys) - 1)
    return [(start + timedelta(days=i), q) for i, q in enumerate(qtys)]


class TestForecastStrategies(unittest.TestCase):
    def test_period_average(self):
        s = PeriodAverageStrategy()
        self.assertEqual(s.daily_rate(_history([10.0, 20.0, 30.0])), 20.0)

    def test_weighted_average_recent_heavier(self):
        s = WeightedAverageStrategy()
        rate = s.daily_rate(_history([0.0, 0.0, 30.0]))
        self.assertGreater(rate, 10.0)

    def test_weekday_average_same_weekday(self):
        s = WeekdayAverageStrategy()
        hist = _history([10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0])
        rate = s.daily_rate(hist)
        self.assertGreater(rate, 0.0)


class TestMoqAndMultiple(unittest.TestCase):
    def test_moq_100(self):
        self.assertEqual(apply_moq_and_multiple(73, 100, None), 100)

    def test_multiple_25(self):
        self.assertEqual(apply_moq_and_multiple(73, None, 25), 75)
        self.assertEqual(apply_moq_and_multiple(101, None, 25), 125)


class TestApprovedCombinedMethodology(unittest.TestCase):
    """CASE A–I from §26 backlog (target_stock = daily_rate × coverage)."""

    def _base(self, *, on_hand: float, pipeline: float, orders: float = 20.0) -> float:
        daily_rate = 10.0
        coverage = 7
        target = forecast_target_stock(
            daily_rate=daily_rate, coverage_days=coverage, min_stock=None, max_stock=None
        )
        self.assertEqual(target, 70.0)
        return combined_production_need(
            order_demand=orders,
            target_stock=target,
            on_hand=on_hand,
            in_pipeline=pipeline,
        )

    def test_case_a_orders20_stock0_pipeline0(self):
        self.assertEqual(self._base(on_hand=0, pipeline=0), 90.0)

    def test_case_b_orders20_stock50(self):
        self.assertEqual(self._base(on_hand=50, pipeline=0), 40.0)

    def test_case_d_pipeline30(self):
        self.assertEqual(self._base(on_hand=0, pipeline=30), 60.0)

    def test_case_e_stock100(self):
        self.assertEqual(self._base(on_hand=100, pipeline=0), 0.0)

    def test_case_f_no_orders_stock20(self):
        self.assertEqual(self._base(on_hand=20, pipeline=0, orders=0.0), 50.0)

    def test_case_g_moq_multiple_after_combined(self):
        raw = self._base(on_hand=50, pipeline=0)  # 40
        self.assertEqual(apply_moq_and_multiple(raw, 50, 25), 50.0)
        self.assertEqual(apply_moq_and_multiple(raw, None, 25), 50.0)

    def test_case_h_material_capacity_caps(self):
        raw = self._base(on_hand=0, pipeline=0)  # 90
        self.assertEqual(cap_by_materials(raw, 40.0), 40.0)

    def test_case_i_replenishment_matches_planning_stock_gap(self):
        """Auto replenishment reuses forecast_stock_need (= combined with orders=0)."""
        target = forecast_target_stock(daily_rate=10, coverage_days=7, min_stock=None, max_stock=None)
        planning = combined_production_need(
            order_demand=0, target_stock=target, on_hand=20, in_pipeline=0
        )
        replenish = forecast_stock_need(
            daily_rate=10,
            coverage_days=7,
            min_stock=None,
            max_stock=None,
            on_hand=20,
            in_pipeline=0,
        )
        self.assertEqual(planning, replenish)
        self.assertEqual(planning, 50.0)

    def test_no_double_subtraction_vs_old_bug(self):
        """Old bug: forecast_need already subtracted stock, then combined subtracted again."""
        target = 70.0
        orders, on_hand, pipeline = 20.0, 50.0, 0.0
        correct = combined_production_need(
            order_demand=orders, target_stock=target, on_hand=on_hand, in_pipeline=pipeline
        )
        self.assertEqual(correct, 40.0)
        # Old wrong path would yield ~0: (target-stock) + orders - stock again...
        old_forecast_need = max(0.0, target - on_hand - pipeline)  # 20
        old_combined = max(0.0, orders + old_forecast_need - on_hand - pipeline)  # 0
        self.assertEqual(old_combined, 0.0)
        self.assertNotEqual(correct, old_combined)


class TestCaseCOpenOrdersExcludedFromHistory(unittest.TestCase):
    def test_open_orders_not_in_realized_filter_constants(self):
        from backend.services.production_planning.constants import (
            CANCELLED_LIKE_ORDER_STATUS,
            REALIZED_SALES_ORDER_STATUS,
            TERMINAL_ORDER_STATUS,
        )
        from backend.services.production_planning.order_demand_service import _open_orders_filter
        from backend.services.production_planning.sales_history_service import _realized_sales_filters

        # Open demand uses ~TERMINAL; realized uses positive packed/shipped markers.
        self.assertIn("SHIPPED", TERMINAL_ORDER_STATUS)
        self.assertIn("SHIPPED", REALIZED_SALES_ORDER_STATUS)
        self.assertIn("CANCELLED", CANCELLED_LIKE_ORDER_STATUS)
        open_f = _open_orders_filter(1, 1)
        real_f = _realized_sales_filters(1, 1)
        # Open: tenant/wh/deleted/status/fulfillment/packed_at — 6 clauses
        self.assertEqual(len(open_f), 6)
        # Realized: tenant/wh/deleted/not-cancelled/(packed|status|fulfillment) — 5 clauses
        self.assertEqual(len(real_f), 5)


class TestLeadTimePriority(unittest.TestCase):
    def test_critical_when_lead_time_exceeds_coverage(self):
        p = compute_priority(
            order_demand=0,
            on_hand=20,
            in_pipeline=0,
            coverage_days_value=2.0,
            lead_time=5,
            recommended_qty=50,
        )
        self.assertEqual(p, "CRITICAL")


if __name__ == "__main__":
    unittest.main()
