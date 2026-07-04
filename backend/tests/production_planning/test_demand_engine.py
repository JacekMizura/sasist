"""Unit tests for commercial MRP planning engine."""

from __future__ import annotations

import unittest
from datetime import date, timedelta

from backend.services.production_planning.forecast_strategies import (
    MaxDailyStrategy,
    MedianStrategy,
    PeriodAverageStrategy,
    WeightedAverageStrategy,
    WeekdayAverageStrategy,
)
from backend.services.production_planning.priority_engine import compute_priority
from backend.services.production_planning.production_recommendation_service import (
    apply_moq_and_multiple,
    combined_production_need,
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

    def test_median(self):
        s = MedianStrategy()
        self.assertEqual(s.daily_rate(_history([1.0, 5.0, 100.0])), 5.0)

    def test_max_daily(self):
        s = MaxDailyStrategy()
        self.assertEqual(s.daily_rate(_history([1.0, 5.0, 100.0])), 100.0)


class TestMoqAndMultiple(unittest.TestCase):
    def test_moq_100(self):
        self.assertEqual(apply_moq_and_multiple(73, 100, None), 100)

    def test_multiple_25(self):
        self.assertEqual(apply_moq_and_multiple(73, None, 25), 75)
        self.assertEqual(apply_moq_and_multiple(101, None, 25), 125)


class TestCombinedGap(unittest.TestCase):
    def test_combined_example(self):
        target = forecast_target_stock(daily_rate=10, coverage_days=21, min_stock=None, max_stock=None)
        self.assertEqual(target, 210)
        forecast_need = max(0, target - 80 - 30)
        combined = combined_production_need(
            order_demand=120, forecast_need=forecast_need, on_hand=80, in_pipeline=30
        )
        self.assertEqual(combined, 110.0)


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
