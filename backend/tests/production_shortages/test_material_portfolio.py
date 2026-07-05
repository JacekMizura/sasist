"""Tests for GET /api/production/material-analysis (material portfolio)."""

from __future__ import annotations

import unittest
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from backend.auth.deps import get_current_user
from backend.main import app
from backend.platform_state import mark_tier0_ready
from backend.schemas.production_shortage import MaterialPortfolioRowRead
from backend.schemas.wms_production_settings import ProductionForecastSettings
from backend.services.production_planning.demand_rate_service import DemandForecastContext
from backend.services.production_planning.forecast_strategies import PeriodAverageStrategy
from backend.services.production_shortages.material_portfolio_service import build_material_portfolio


def _history(qtys: list[float]) -> list[tuple[date, float]]:
    start = date.today() - timedelta(days=len(qtys) - 1)
    return [(start + timedelta(days=i), float(q)) for i, q in enumerate(qtys)]


class TestBuildMaterialPortfolio(unittest.TestCase):
    def test_no_active_recipes_returns_empty_list(self):
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.all.return_value = []
        rows = build_material_portfolio(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(rows, [])

    @patch("backend.services.production_shortages.material_portfolio_service.build_production_shortages_queue")
    @patch("backend.services.production_shortages.material_portfolio_service.bulk_product_daily_rates")
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_net_available", return_value=0.0)
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_on_hand", return_value=0.0)
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_reserved_qty", return_value=0.0)
    def test_single_component_no_sales_no_stock(
        self,
        _reserved,
        _on_hand,
        _net,
        bulk_rates,
        build_queue,
    ):
        from backend.models.product import Product
        from backend.models.product_composition import ProductComposition

        db = MagicMock()
        line = SimpleNamespace(component_product_id=55)
        comp = SimpleNamespace(id=9, lines=[line])
        comp_query = MagicMock()
        comp_query.options.return_value.filter.return_value.all.return_value = [comp]
        product = SimpleNamespace(id=55, name="Materiał", sku="M-55", symbol=None, image_url=None)
        product_query = MagicMock()
        product_query.filter.return_value.all.return_value = [product]

        def _query(model):
            if model is ProductComposition:
                return comp_query
            if model is Product:
                return product_query
            return MagicMock()

        db.query.side_effect = _query
        bulk_rates.return_value = ({55: 0.0}, DemandForecastContext(
            settings=ProductionForecastSettings(),
            strategy=PeriodAverageStrategy(),
            lookback_days=30,
        ))
        build_queue.return_value = []

        rows = build_material_portfolio(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["forecast_daily_usage"], 0.0)
        self.assertIsNone(rows[0]["forecast_depletion_date"])
        MaterialPortfolioRowRead(**rows[0])

    @patch("backend.services.production_shortages.material_portfolio_service.build_production_shortages_queue")
    @patch("backend.services.production_shortages.material_portfolio_service.bulk_product_daily_rates")
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_net_available", return_value=2.0)
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_on_hand", return_value=5.0)
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_reserved_qty", return_value=1.0)
    def test_component_with_sales_history(
        self,
        _reserved,
        _on_hand,
        _net,
        bulk_rates,
        build_queue,
    ):
        from backend.models.product import Product
        from backend.models.product_composition import ProductComposition

        db = MagicMock()
        line = SimpleNamespace(component_product_id=77)
        comp = SimpleNamespace(id=2, lines=[line])
        comp_query = MagicMock()
        comp_query.options.return_value.filter.return_value.all.return_value = [comp]
        product = SimpleNamespace(id=77, name="Półprodukt", sku="SP-77", symbol=None, image_url=None)
        product_query = MagicMock()
        product_query.filter.return_value.all.return_value = [product]

        def _query(model):
            if model is ProductComposition:
                return comp_query
            if model is Product:
                return product_query
            return MagicMock()

        db.query.side_effect = _query
        bulk_rates.return_value = ({77: 6.0}, DemandForecastContext(
            settings=ProductionForecastSettings(strategy="PERIOD_AVERAGE"),
            strategy=PeriodAverageStrategy(),
            lookback_days=30,
        ))
        build_queue.return_value = [
            {
                "component_product_id": 77,
                "blocked_batches_count": 1,
                "blocked_orders_count": 0,
            }
        ]

        rows = build_material_portfolio(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["forecast_daily_usage"], 6.0)
        self.assertEqual(rows[0]["blocked_productions_count"], 1)
        MaterialPortfolioRowRead(**rows[0])

    @patch("backend.services.production_shortages.material_portfolio_service.build_production_shortages_queue", side_effect=RuntimeError("queue down"))
    @patch("backend.services.production_shortages.material_portfolio_service.bulk_product_daily_rates", return_value=({88: 0.0}, DemandForecastContext(
        settings=ProductionForecastSettings(),
        strategy=PeriodAverageStrategy(),
        lookback_days=30,
    )))
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_net_available", return_value=0.0)
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_on_hand", return_value=0.0)
    @patch("backend.services.production_shortages.material_portfolio_service.warehouse_reserved_qty", return_value=0.0)
    def test_queue_failure_does_not_raise(
        self,
        _reserved,
        _on_hand,
        _net,
        _bulk,
        _queue,
    ):
        from backend.models.product import Product
        from backend.models.product_composition import ProductComposition

        db = MagicMock()
        line = SimpleNamespace(component_product_id=88)
        comp = SimpleNamespace(id=3, lines=[line])
        comp_query = MagicMock()
        comp_query.options.return_value.filter.return_value.all.return_value = [comp]
        product = SimpleNamespace(id=88, name="X", sku=None, symbol=None, image_url=None)
        product_query = MagicMock()
        product_query.filter.return_value.all.return_value = [product]
        db.query.side_effect = lambda model: comp_query if model is ProductComposition else product_query

        rows = build_material_portfolio(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["blocked_productions_count"], 0)


class TestDemandRateServiceIntegration(unittest.TestCase):
    @patch("backend.services.production_planning.demand_rate_service.bulk_daily_sales_series")
    @patch("backend.services.production_planning.demand_rate_service.load_forecast_settings")
    def test_bulk_product_daily_rates_uses_configured_strategy(self, load_settings, bulk_history):
        from backend.services.production_planning.demand_rate_service import bulk_product_daily_rates

        load_settings.return_value = ProductionForecastSettings(
            strategy="PERIOD_AVERAGE",
            sales_lookback_days=14,
        )
        bulk_history.return_value = {5: _history([10.0, 20.0, 30.0])}
        db = MagicMock()

        rates, ctx = bulk_product_daily_rates(db, tenant_id=1, warehouse_id=1, product_ids=[5])
        self.assertEqual(rates[5], 20.0)
        self.assertEqual(ctx.lookback_days, 14)
        bulk_history.assert_called_once()
        self.assertEqual(bulk_history.call_args.kwargs["lookback_days"], 14)


class MaterialAnalysisApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        mark_tier0_ready()
        cls.client = TestClient(app, raise_server_exceptions=True)

    def setUp(self) -> None:
        app.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1, login="test", role="super_admin")

    def tearDown(self) -> None:
        app.dependency_overrides.pop(get_current_user, None)

    def test_material_analysis_endpoint_not_500(self):
        r = self.client.get(
            "/api/production/material-analysis",
            params={"tenant_id": 1, "warehouse_id": 1},
        )
        self.assertNotEqual(r.status_code, 500, r.text[:2000])
        self.assertEqual(r.status_code, 200, r.text[:2000])
        self.assertIsInstance(r.json(), list)


if __name__ == "__main__":
    unittest.main()
