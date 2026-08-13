"""Phase 9 — automatic PLANNING stock replenishment scheduler."""

from __future__ import annotations

import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from backend.schemas.wms_production_settings import ProductionForecastSettings
from backend.services.production_planning.auto_replenishment_scheduler import (
    list_auto_replenishment_targets,
    run_due_stock_replenishment_jobs,
)
from backend.services.production_planning.constants import (
    DEFAULT_STOCK_REPLENISHMENT_INTERVAL,
    STOCK_REPLENISHMENT_COVERAGE_PRESETS,
    STOCK_REPLENISHMENT_INTERVAL_PRESETS,
)
from backend.services.production_planning.forecast_settings_service import (
    is_stock_replenishment_due,
    parse_forecast_settings_json,
    replenishment_interval_hours,
)


class TestIntervalSettings(unittest.TestCase):
    def test_default_interval_is_daily(self):
        s = ProductionForecastSettings()
        self.assertEqual(s.normalized_replenishment_interval(), DEFAULT_STOCK_REPLENISHMENT_INTERVAL)
        self.assertEqual(replenishment_interval_hours(s), 24)

    def test_interval_presets(self):
        self.assertEqual(
            STOCK_REPLENISHMENT_INTERVAL_PRESETS,
            ("hourly", "every_3_hours", "every_6_hours", "daily"),
        )
        self.assertEqual(replenishment_interval_hours(ProductionForecastSettings(stock_replenishment_interval="hourly")), 1)
        self.assertEqual(
            replenishment_interval_hours(ProductionForecastSettings(stock_replenishment_interval="every_3_hours")),
            3,
        )
        self.assertEqual(
            replenishment_interval_hours(ProductionForecastSettings(stock_replenishment_interval="every_6_hours")),
            6,
        )

    def test_coverage_presets_unchanged(self):
        self.assertEqual(STOCK_REPLENISHMENT_COVERAGE_PRESETS, (1, 3, 7, 14))


class TestDueLogic(unittest.TestCase):
    def test_auto_off_never_due(self):
        s = ProductionForecastSettings(auto_stock_replenishment=False)
        self.assertFalse(is_stock_replenishment_due(s, now=datetime.utcnow()))

    def test_auto_on_never_run_is_due(self):
        s = ProductionForecastSettings(auto_stock_replenishment=True, stock_replenishment_interval="daily")
        self.assertTrue(is_stock_replenishment_due(s, now=datetime.utcnow()))

    def test_auto_on_recent_run_not_due(self):
        now = datetime(2026, 8, 13, 12, 0, 0)
        s = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_interval="hourly",
            last_replenishment_run_at=(now - timedelta(minutes=30)).isoformat(timespec="seconds"),
        )
        self.assertFalse(is_stock_replenishment_due(s, now=now))

    def test_auto_on_interval_elapsed_is_due(self):
        now = datetime(2026, 8, 13, 12, 0, 0)
        s = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_interval="hourly",
            last_replenishment_run_at=(now - timedelta(hours=2)).isoformat(timespec="seconds"),
        )
        self.assertTrue(is_stock_replenishment_due(s, now=now))


class TestSchedulerTargets(unittest.TestCase):
    def test_list_targets_skips_auto_off(self):
        row_off = MagicMock()
        row_off.tenant_id = 1
        row_off.warehouse_id = 1
        row_off.production_forecast_json = '{"auto_stock_replenishment": false}'
        row_on = MagicMock()
        row_on.tenant_id = 1
        row_on.warehouse_id = 2
        row_on.production_forecast_json = (
            '{"auto_stock_replenishment": true, "stock_replenishment_coverage_days": 7}'
        )
        db = MagicMock()
        q = MagicMock()
        db.query.return_value = q
        q.filter.return_value = q
        q.order_by.return_value = q
        q.all.return_value = [row_off, row_on]
        self.assertEqual(list_auto_replenishment_targets(db), [(1, 2)])

    @patch("backend.services.production_planning.auto_replenishment_scheduler.run_production_stock_replenishment")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.load_forecast_settings")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.list_auto_replenishment_targets")
    def test_scheduler_skips_not_due(self, mock_targets, mock_load, mock_run):
        mock_targets.return_value = [(1, 1)]
        mock_load.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_interval="daily",
            last_replenishment_run_at=datetime.utcnow().isoformat(timespec="seconds"),
        )
        out = run_due_stock_replenishment_jobs(MagicMock(), now=datetime.utcnow())
        self.assertEqual(out["ran"], 0)
        self.assertEqual(out["skipped_not_due"], 1)
        mock_run.assert_not_called()

    @patch("backend.services.production_planning.auto_replenishment_scheduler.run_production_stock_replenishment")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.load_forecast_settings")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.list_auto_replenishment_targets")
    def test_scheduler_runs_due(self, mock_targets, mock_load, mock_run):
        mock_targets.return_value = [(1, 1)]
        mock_load.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_interval="hourly",
            last_replenishment_run_at=None,
        )
        mock_run.return_value = MagicMock(created_count=1, total_quantity=10.0, skipped_count=0)
        db = MagicMock()
        out = run_due_stock_replenishment_jobs(db, now=datetime.utcnow())
        self.assertEqual(out["ran"], 1)
        mock_run.assert_called_once()
        db.commit.assert_called()

    @patch("backend.services.production_planning.auto_replenishment_scheduler.run_production_stock_replenishment")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.load_forecast_settings")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.list_auto_replenishment_targets")
    def test_one_warehouse_error_continues(self, mock_targets, mock_load, mock_run):
        mock_targets.return_value = [(1, 1), (1, 2)]
        mock_load.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            last_replenishment_run_at=None,
        )

        def _run(db, *, tenant_id, warehouse_id, **_k):
            if warehouse_id == 1:
                raise RuntimeError("boom")
            return MagicMock(created_count=0, total_quantity=0.0, skipped_count=0)

        mock_run.side_effect = _run
        db = MagicMock()
        out = run_due_stock_replenishment_jobs(db, now=datetime.utcnow())
        self.assertEqual(out["errors"], 1)
        self.assertEqual(out["ran"], 1)
        self.assertEqual(mock_run.call_count, 2)


class TestIdempotentReplenishment(unittest.TestCase):
    @patch("backend.services.production_planning.stock_replenishment_service.record_replenishment_run")
    @patch("backend.services.production_planning.stock_replenishment_service._wake_orders_shortages_before_planning")
    @patch("backend.services.production_planning.stock_replenishment_service._reserve_planning_materials")
    @patch("backend.services.production_planning.stock_replenishment_service._create_planning_mo")
    @patch("backend.services.production_planning.stock_replenishment_service._find_aggregable_planning_mo")
    @patch("backend.services.production_planning.stock_replenishment_service.max_producible_after_orders_hold")
    @patch("backend.services.production_planning.stock_replenishment_service.soft_hold_components_for_orders")
    @patch("backend.services.production_planning.stock_replenishment_service.ensure_orders_material_priority")
    @patch("backend.services.production_planning.stock_replenishment_service.build_planning_snapshot")
    @patch("backend.services.production_planning.stock_replenishment_service.load_forecast_settings")
    def test_second_run_no_extra_when_pipeline_covers(
        self,
        mock_load,
        mock_snap,
        mock_orders,
        mock_hold,
        mock_max,
        mock_find,
        mock_create,
        mock_reserve,
        mock_wake,
        mock_record,
    ):
        from backend.services.production_planning.stock_replenishment_service import (
            run_production_stock_replenishment,
            _SoftHoldState,
        )

        mock_load.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_coverage_days=3,
        )
        # First call: need 10; second: need 0 (pipeline covered).
        row_need = MagicMock(
            product_id=100,
            product_name="P",
            composition_id=1,
            stock_replenishment_needed=10,
        )
        snap1 = MagicMock(products=[row_need])
        snap2 = MagicMock(
            products=[
                MagicMock(
                    product_id=100,
                    product_name="P",
                    composition_id=1,
                    stock_replenishment_needed=0,
                )
            ]
        )
        mock_snap.side_effect = [snap1, snap2]
        mock_hold.return_value = _SoftHoldState(by_component={})
        mock_max.return_value = 100.0
        mock_find.return_value = None
        mo = MagicMock(id=9, number="MO/P")
        mock_create.return_value = mo
        db = MagicMock()
        db.query.return_value.options.return_value.filter.return_value.all.return_value = [
            MagicMock(id=1, lines=[])
        ]

        r1 = run_production_stock_replenishment(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(r1.created_count, 1)
        self.assertEqual(r1.total_quantity, 10.0)

        r2 = run_production_stock_replenishment(db, tenant_id=1, warehouse_id=1)
        self.assertEqual(r2.created_count, 0)
        self.assertEqual(r2.aggregated_count, 0)
        self.assertEqual(r2.total_quantity, 0.0)
        self.assertEqual(mock_create.call_count, 1)

    def test_parse_preserves_interval(self):
        s = parse_forecast_settings_json(
            '{"auto_stock_replenishment": true, "stock_replenishment_interval": "every_6_hours"}'
        )
        self.assertEqual(s.stock_replenishment_interval, "every_6_hours")


class TestWorkerTick(unittest.TestCase):
    @patch(
        "backend.services.production_planning.auto_replenishment_scheduler.run_due_stock_replenishment_jobs"
    )
    @patch("backend.workers.schema_guard.require_production_schema_valid")
    def test_worker_calls_scheduler(self, _gate, mock_jobs):
        from backend.workers.production_stock_replenishment_worker import (
            run_production_stock_replenishment_worker,
        )

        mock_jobs.return_value = {"ran": 0, "errors": 0}
        out = run_production_stock_replenishment_worker(MagicMock())
        self.assertEqual(out["ran"], 0)
        mock_jobs.assert_called_once()


if __name__ == "__main__":
    unittest.main()
