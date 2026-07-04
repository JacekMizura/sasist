"""Unit tests for production demand planning engine."""

from __future__ import annotations

import unittest

from backend.services.production_planning.priority_service import (
    coverage_color,
    coverage_days,
    production_priority,
)
from backend.services.production_planning.sales_velocity_service import (
    forecast_production_needed,
    forecast_target_stock,
)


class TestSalesVelocity(unittest.TestCase):
    def test_forecast_target_stock(self):
        self.assertEqual(forecast_target_stock(10.0, 21), 210.0)

    def test_forecast_production_needed_never_negative(self):
        need = forecast_production_needed(avg_daily=10.0, coverage_days=21, on_hand=80.0, in_pipeline=30.0)
        self.assertEqual(need, 100.0)
        self.assertEqual(
            forecast_production_needed(avg_daily=1.0, coverage_days=7, on_hand=100.0, in_pipeline=0.0),
            0.0,
        )


class TestCoverageAndPriority(unittest.TestCase):
    def test_coverage_days(self):
        self.assertAlmostEqual(coverage_days(on_hand=80.0, avg_daily=10.0), 8.0)
        self.assertIsNone(coverage_days(on_hand=80.0, avg_daily=0.0))

    def test_coverage_color_bands(self):
        self.assertEqual(coverage_color(5.0), "red")
        self.assertEqual(coverage_color(10.0), "orange")
        self.assertEqual(coverage_color(20.0), "green")
        self.assertEqual(coverage_color(45.0), "blue")

    def test_priority_critical_when_orders_uncovered(self):
        self.assertEqual(
            production_priority(order_demand=120.0, on_hand=80.0, in_pipeline=30.0, coverage_days_value=18.0),
            "CRITICAL",
        )

    def test_priority_high_when_low_coverage(self):
        self.assertEqual(
            production_priority(order_demand=0.0, on_hand=50.0, in_pipeline=0.0, coverage_days_value=5.0),
            "HIGH",
        )


    def test_combined_gap_example(self):
        order_demand = 120.0
        forecast_need = 100.0
        on_hand = 80.0
        pipeline = 30.0
        combined = max(0.0, order_demand + forecast_need - on_hand - pipeline)
        self.assertEqual(combined, 110.0)


if __name__ == "__main__":
    unittest.main()
