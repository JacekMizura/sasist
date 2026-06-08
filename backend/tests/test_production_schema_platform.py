"""
Production schema platform infrastructure — health endpoint, workers, no-op prevention.

  python -m pytest backend/tests/test_production_schema_platform.py -q
"""

from __future__ import annotations

import unittest
from unittest.mock import patch

from sqlalchemy import create_engine, text

from backend.db.production_schema import (
    PRODUCTION_SCHEMA_GENERATION,
    get_production_schema_health,
    run_production_schema_startup_gate,
)
from backend.platform_state import (
    clear_production_schema_valid,
    get_production_schema_health_snapshot,
    is_production_schema_valid,
    mark_production_schema_valid,
)
from backend.workers.schema_guard import require_production_schema_valid


def _seed_production_sqlite_fk_stubs(engine) -> None:
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE IF NOT EXISTS tenants (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS warehouses (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS app_users (id INTEGER PRIMARY KEY)"))
        conn.execute(text("CREATE TABLE IF NOT EXISTS stock_documents (id INTEGER PRIMARY KEY)"))


def _ensure_full_production_sqlite(engine) -> None:
    from backend.db.schema_upgrade import ensure_product_compositions_and_batches, ensure_production_tables

    _seed_production_sqlite_fk_stubs(engine)
    ensure_production_tables(engine)
    ensure_product_compositions_and_batches(engine)


def _legacy_production_batches_sqlite() -> str:
    return """
        CREATE TABLE production_batches (
            id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            number VARCHAR(64) NOT NULL,
            warehouse_id INTEGER NOT NULL,
            status VARCHAR(32) NOT NULL DEFAULT 'draft',
            notes TEXT,
            rw_stock_document_id INTEGER,
            created_by_user_id INTEGER,
            started_at DATETIME,
            completed_at DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL
        )
    """


class TestProductionSchemaHealth(unittest.TestCase):
    def setUp(self):
        clear_production_schema_valid()

    def test_health_ok_after_gate(self):
        engine = create_engine("sqlite:///:memory:")
        _ensure_full_production_sqlite(engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE production_batches"))
            conn.execute(text(_legacy_production_batches_sqlite()))
        run_production_schema_startup_gate(engine, phase="test")
        health = get_production_schema_health(engine)
        self.assertEqual(health["status"], "ok")
        self.assertEqual(health["production_schema_version"], PRODUCTION_SCHEMA_GENERATION)
        self.assertEqual(health["missing_tables"], [])
        self.assertEqual(health["missing_columns"], [])

    def test_health_detects_drift(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        health = get_production_schema_health(engine)
        self.assertEqual(health["status"], "drift_detected")
        missing = {m["column"] for m in health["missing_columns"] if m["table"] == "production_batches"}
        self.assertIn("collection_state_json", missing)

    def test_gate_marks_platform_state(self):
        engine = create_engine("sqlite:///:memory:")
        _ensure_full_production_sqlite(engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE production_batches"))
            conn.execute(text(_legacy_production_batches_sqlite()))
        self.assertFalse(is_production_schema_valid())
        run_production_schema_startup_gate(engine, phase="test")
        self.assertTrue(is_production_schema_valid())
        snap = get_production_schema_health_snapshot()
        self.assertIsNotNone(snap)
        self.assertEqual(snap["status"], "ok")


class TestProductionSchemaStartupSummary(unittest.TestCase):
    def test_gate_logs_schema_version_and_summary(self):
        engine = create_engine("sqlite:///:memory:")
        _ensure_full_production_sqlite(engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE production_batches"))
            conn.execute(text(_legacy_production_batches_sqlite()))
        with patch("builtins.print") as mock_print:
            run_production_schema_startup_gate(engine, phase="test")
        printed = "\n".join(str(c.args[0]) for c in mock_print.call_args_list if c.args)
        self.assertIn("PRODUCTION_SCHEMA_VERSION=", printed)
        self.assertIn(f"PRODUCTION_SCHEMA_VERSION={PRODUCTION_SCHEMA_GENERATION}", printed)
        self.assertIn("[production.schema.audit.summary]", printed)
        self.assertIn("status=OK", printed)
        self.assertIn("drift_detected=false", printed)


class TestPostgresSchemaWrapperPolicy(unittest.TestCase):
    def test_production_helpers_in_postgres_allowlist(self):
        from backend.main import _POSTGRES_SAFE_SCHEMA_FUNCS

        for name in (
            "ensure_production_tables",
            "ensure_product_compositions_and_batches",
            "ensure_production_batch_schema_sync",
            "ensure_production_schema_evolution",
        ):
            self.assertIn(name, _POSTGRES_SAFE_SCHEMA_FUNCS)

    def test_sqlite_only_wrapper_logs_skip_on_postgres(self):
        from backend.db.schema_upgrade import ensure_locations_columns
        from backend.main import _sqlite_only_schema_helper

        pg_engine = create_engine("postgresql://localhost/test")
        wrapped = _sqlite_only_schema_helper(ensure_locations_columns)
        with self.assertLogs("backend.main", level="DEBUG") as logs:
            result = wrapped(pg_engine)
        self.assertIsNone(result)
        self.assertTrue(any("SCHEMA_HELPER_SKIPPED_POSTGRES" in m for m in logs.output))


class TestWorkerSchemaGuard(unittest.TestCase):
    def setUp(self):
        clear_production_schema_valid()

    def test_worker_blocked_when_schema_invalid(self):
        engine = create_engine("sqlite:///:memory:")
        mark_production_schema_valid(
            health={
                "status": "drift_detected",
                "missing_columns": [{"table": "production_batches", "column": "collection_state_json"}],
            }
        )
        with self.assertRaises(RuntimeError) as ctx:
            require_production_schema_valid(context="test_worker", engine=engine)
        self.assertIn("worker blocked", str(ctx.exception).lower())


class TestHealthSchemaEndpoint(unittest.TestCase):
    def setUp(self):
        clear_production_schema_valid()

    def test_health_schema_endpoint_returns_snapshot_when_valid(self):
        from fastapi.testclient import TestClient

        from backend.main import app

        health = {
            "status": "ok",
            "dialect": "sqlite",
            "production_schema_version": PRODUCTION_SCHEMA_GENERATION,
            "production_schema_version_label": "2026.06.04.1",
            "missing_tables": [],
            "missing_columns": [],
            "type_mismatches": [],
            "fk_mismatches": [],
        }
        mark_production_schema_valid(health=health)
        client = TestClient(app)
        resp = client.get("/health/schema")
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body["status"], "ok")
        self.assertEqual(body["production_schema_version"], PRODUCTION_SCHEMA_GENERATION)


if __name__ == "__main__":
    unittest.main()
