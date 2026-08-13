"""Phase 9 audit — scheduler concurrency, restart due-check, failure isolation."""

from __future__ import annotations

import threading
import unittest
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

from backend.schemas.wms_production_settings import ProductionForecastSettings
from backend.services.pg_advisory_lock import stable_advisory_lock_key
from backend.services.production_planning.auto_replenishment_scheduler import (
    run_due_stock_replenishment_jobs,
)
from backend.services.production_planning.forecast_settings_service import is_stock_replenishment_due
from backend.workers.operational_loop import tick_operational_workers_once


class TestStableAdvisoryKey(unittest.TestCase):
    def test_key_is_process_stable(self):
        a = stable_advisory_lock_key("prod_stock_replenish", 1, 2)
        b = stable_advisory_lock_key("prod_stock_replenish", 1, 2)
        self.assertEqual(a, b)
        self.assertNotEqual(
            stable_advisory_lock_key("prod_stock_replenish", 1, 2),
            stable_advisory_lock_key("prod_stock_replenish", 1, 3),
        )
        self.assertGreaterEqual(a, 0)
        self.assertLessEqual(a, 0x7FFFFFFF)


class TestRestartDueFromPersistedLastRun(unittest.TestCase):
    """Schedule truth lives in production_forecast_json — not process memory."""

    def test_old_last_run_due_after_restart(self):
        now = datetime(2026, 8, 13, 12, 0, 0)
        s = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_interval="hourly",
            last_replenishment_run_at=(now - timedelta(hours=3)).isoformat(timespec="seconds"),
        )
        self.assertTrue(is_stock_replenishment_due(s, now=now))

    def test_fresh_last_run_skipped_after_restart(self):
        now = datetime(2026, 8, 13, 12, 0, 0)
        s = ProductionForecastSettings(
            auto_stock_replenishment=True,
            stock_replenishment_interval="hourly",
            last_replenishment_run_at=(now - timedelta(minutes=10)).isoformat(timespec="seconds"),
        )
        self.assertFalse(is_stock_replenishment_due(s, now=now))


class TestDualWorkerSameWarehouse(unittest.TestCase):
    @patch("backend.services.production_planning.auto_replenishment_scheduler.run_production_stock_replenishment")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.load_forecast_settings")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.list_auto_replenishment_targets")
    def test_parallel_workers_do_not_crash_and_serialize_via_service(
        self, mock_targets, mock_load, mock_run
    ):
        """
        Simulate two process ticks racing the same due warehouse.

        Service-level advisory lock + pipeline idempotency are the safety net;
        this test asserts the scheduler layer survives parallel calls without
        IntegrityError bubbling out or cross-rollback of the other worker's commit.
        """
        mock_targets.return_value = [(1, 1)]
        mock_load.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            last_replenishment_run_at=None,
        )

        barrier = threading.Barrier(2)
        results: list[dict] = []
        errors: list[BaseException] = []
        call_lock = threading.Lock()
        calls = {"n": 0}

        def _run(db, *, tenant_id, warehouse_id, **_k):
            barrier.wait(timeout=5)
            with call_lock:
                calls["n"] += 1
                n = calls["n"]
            # First creates qty; second is no-op (pipeline covered) — no exception.
            if n == 1:
                return MagicMock(created_count=1, total_quantity=10.0, skipped_count=0)
            return MagicMock(created_count=0, total_quantity=0.0, skipped_count=0)

        mock_run.side_effect = _run

        def _worker():
            db = MagicMock()
            try:
                out = run_due_stock_replenishment_jobs(db, now=datetime.utcnow())
                results.append(out)
            except BaseException as exc:  # noqa: BLE001 — audit: worker must not die
                errors.append(exc)

        t1 = threading.Thread(target=_worker)
        t2 = threading.Thread(target=_worker)
        t1.start()
        t2.start()
        t1.join(timeout=10)
        t2.join(timeout=10)

        self.assertEqual(errors, [])
        self.assertEqual(len(results), 2)
        self.assertEqual(mock_run.call_count, 2)
        # Each worker commits its own session — neither rolls back the other.
        total_created = sum(int(r.get("ran") or 0) for r in results)
        self.assertEqual(total_created, 2)  # both ran the job; second is qty no-op inside service


class TestFailureIsolationAndLoopSurvives(unittest.TestCase):
    @patch("backend.services.production_planning.auto_replenishment_scheduler.run_production_stock_replenishment")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.load_forecast_settings")
    @patch("backend.services.production_planning.auto_replenishment_scheduler.list_auto_replenishment_targets")
    def test_warehouse_a_error_b_still_runs(self, mock_targets, mock_load, mock_run):
        mock_targets.return_value = [(1, 1), (1, 2)]
        mock_load.return_value = ProductionForecastSettings(
            auto_stock_replenishment=True,
            last_replenishment_run_at=None,
        )

        def _run(db, *, tenant_id, warehouse_id, **_k):
            if int(warehouse_id) == 1:
                raise RuntimeError("warehouse A boom")
            return MagicMock(created_count=1, total_quantity=4.0, skipped_count=0)

        mock_run.side_effect = _run
        db = MagicMock()
        out = run_due_stock_replenishment_jobs(db, now=datetime.utcnow())
        self.assertEqual(out["errors"], 1)
        self.assertEqual(out["ran"], 1)
        self.assertEqual(out["results"][0]["warehouse_id"], 2)
        db.rollback.assert_called()
        self.assertGreaterEqual(db.commit.call_count, 1)

    @patch("backend.workers.production_stock_replenishment_worker.run_production_stock_replenishment_worker")
    @patch("backend.workers.replenishment_scan_worker.run_replenishment_scan_worker", return_value=0)
    @patch("backend.workers.document_generation_worker.process_pending_document_jobs", return_value=0)
    @patch("backend.workers.cart_lifecycle_worker.run_cart_lifecycle_worker", return_value={})
    @patch("backend.workers.reservation_expiration_worker.run_reservation_lifecycle_worker", return_value={})
    @patch("backend.workers.schema_guard.require_production_schema_valid")
    @patch("backend.platform_state.is_production_schema_valid", return_value=True)
    @patch("backend.database.SessionLocal")
    def test_tick_exception_does_not_kill_next_tick(
        self,
        mock_session_local,
        _valid,
        _gate,
        mock_res,
        mock_cart,
        mock_docs,
        mock_shelf,
        mock_prod,
    ):
        db = MagicMock()
        mock_session_local.return_value = db
        mock_prod.side_effect = [RuntimeError("tick1 boom"), {"ran": 1}]

        with self.assertRaises(RuntimeError):
            tick_operational_workers_once()

        # Second tick still opens a fresh session and runs.
        out = tick_operational_workers_once()
        self.assertEqual(out["production_stock_replenishment"]["ran"], 1)
        self.assertEqual(mock_session_local.call_count, 2)
        self.assertEqual(db.close.call_count, 2)


if __name__ == "__main__":
    unittest.main()
