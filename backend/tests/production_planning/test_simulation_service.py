"""Regression tests for production plan simulation."""

from __future__ import annotations

import unittest
from unittest.mock import MagicMock, patch

from backend.schemas.production_planning import ProductionDemandPlanningRead, ProductionPlanningDashboardRead
from backend.services.production_planning.planning_service import PlanningContext
from backend.services.production_planning.simulation_service import simulate_production_plan


class TestSimulateProductionPlan(unittest.TestCase):
    @patch("backend.services.production_planning.simulation_service.build_planning_snapshot")
    def test_returns_resolved_forecast_strategy_when_ctx_has_none(self, mock_snapshot):
        """Regression: ctx.forecast_strategy is None from API; response must not 500."""
        mock_snapshot.return_value = ProductionDemandPlanningRead(
            tenant_id=1,
            warehouse_id=1,
            coverage_days=21,
            sales_lookback_days=90,
            forecast_strategy="PERIOD_AVERAGE",
            forecast_strategy_label="Średnia okresu",
            dashboard=ProductionPlanningDashboardRead(),
            products=[],
        )
        db = MagicMock()
        ctx = PlanningContext(tenant_id=1, warehouse_id=1, coverage_days=21)

        result = simulate_production_plan(db, ctx)

        self.assertEqual(result.forecast_strategy, "PERIOD_AVERAGE")
        self.assertEqual(result.coverage_days, 21)
        self.assertEqual(result.lines, [])
        self.assertEqual(result.total_simulated_quantity, 0.0)

    @patch("backend.services.production_planning.simulation_service.build_planning_snapshot")
    def test_empty_snapshot_returns_200_shape_not_error(self, mock_snapshot):
        mock_snapshot.return_value = ProductionDemandPlanningRead(
            tenant_id=1,
            warehouse_id=99,
            coverage_days=21,
            sales_lookback_days=90,
            forecast_strategy="WEIGHTED_AVERAGE",
            dashboard=ProductionPlanningDashboardRead(),
            products=[],
        )
        db = MagicMock()
        ctx = PlanningContext(tenant_id=1, warehouse_id=99, coverage_days=21)

        result = simulate_production_plan(db, ctx)

        self.assertIsInstance(result.forecast_strategy, str)
        self.assertGreater(len(result.forecast_strategy), 0)


if __name__ == "__main__":
    unittest.main()
