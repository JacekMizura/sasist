"""
Production schema evolution — versioning, audit, isolated sync.

  python -m pytest backend/tests/test_production_schema_evolution.py -q
"""

from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import patch

from sqlalchemy import create_engine, text
from sqlalchemy.schema import CreateColumn

from backend.db.production_schema import (
    PRODUCTION_SCHEMA_GENERATION,
    PRODUCTION_SCHEMA_VERSION,
    SCHEMA_METADATA_KEY,
    ProductionSchemaMigration,
    apply_pending_production_migrations,
    ensure_production_schema_evolution,
    ensure_schema_metadata_table,
    get_production_schema_version,
    run_production_schema_audit,
    run_production_schema_startup_gate,
)
from backend.platform_state import clear_production_schema_valid
from backend.db.schema_introspection import audit_model_schema, ensure_model_schema_sync
from backend.db.schema_upgrade import ensure_production_batch_schema_sync
from backend.models.product_composition import ProductionBatch


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


class TestProductionSchemaVersioning(unittest.TestCase):
    def test_schema_metadata_roundtrip_sqlite(self):
        engine = create_engine("sqlite:///:memory:")
        ensure_schema_metadata_table(engine)
        self.assertIsNone(get_production_schema_version(engine))
        from backend.db.production_schema import set_production_schema_version

        set_production_schema_version(engine, PRODUCTION_SCHEMA_VERSION)
        self.assertEqual(get_production_schema_version(engine), PRODUCTION_SCHEMA_VERSION)

        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT key, version FROM schema_metadata WHERE key = :k"),
                {"k": SCHEMA_METADATA_KEY},
            ).one()
        self.assertEqual(row[0], SCHEMA_METADATA_KEY)


class TestEnsureModelSchemaSync(unittest.TestCase):
    def test_postgres_datetime_compiles_to_timestamp(self):
        sql = str(
            CreateColumn(ProductionBatch.__table__.columns["collecting_completed_at"]).compile(
                dialect=create_engine("postgresql://localhost/test").dialect
            )
        ).upper()
        self.assertIn("TIMESTAMP", sql)
        self.assertNotIn("DATETIME", sql)

    def test_legacy_upgrade_adds_workflow_columns(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        added = ensure_model_schema_sync(engine, ProductionBatch, log_prefix="test.sync")
        self.assertGreaterEqual(added, 3)
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(production_batches)"))}
        self.assertIn("collection_state_json", cols)

    def test_sync_is_idempotent(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        first = ensure_model_schema_sync(engine, ProductionBatch)
        second = ensure_model_schema_sync(engine, ProductionBatch)
        self.assertGreaterEqual(first, 3)
        self.assertEqual(second, 0)


class TestProductionSchemaAudit(unittest.TestCase):
    def test_audit_detects_missing_columns(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        audit = audit_model_schema(engine, ProductionBatch)
        self.assertIn("collection_state_json", audit["missing_in_db"])

    def test_audit_detects_datetime_vs_text_type_drift(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    CREATE TABLE production_batches (
                        id INTEGER PRIMARY KEY,
                        tenant_id INTEGER NOT NULL,
                        number VARCHAR(64) NOT NULL,
                        warehouse_id INTEGER NOT NULL,
                        status TEXT NOT NULL DEFAULT 'draft',
                        notes TEXT,
                        rw_stock_document_id INTEGER,
                        created_by_user_id INTEGER,
                        collection_state_json TEXT,
                        started_at DATETIME,
                        collecting_completed_at DATETIME,
                        production_completed_at DATETIME,
                        completed_at DATETIME,
                        created_at DATETIME NOT NULL,
                        updated_at DATETIME NOT NULL
                    )
                    """
                )
            )
        audit = audit_model_schema(engine, ProductionBatch)
        status_col = next((m for m in audit["type_mismatches"] if m["column"] == "status"), None)
        self.assertIsNotNone(status_col)
        self.assertIn("VARCHAR", status_col["expected"].upper())

    def test_startup_audit_summary_ok_after_sync(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text("CREATE TABLE tenants (id INTEGER PRIMARY KEY)"))
            conn.execute(text(_legacy_production_batches_sqlite()))
        result = ensure_production_schema_evolution(engine)
        self.assertEqual(result["version_after"], PRODUCTION_SCHEMA_VERSION)
        batch_missing = [
            m for m in result["audit"]["missing_columns"] if m["table"] == "production_batches"
        ]
        self.assertEqual(batch_missing, [])
        with engine.connect() as conn:
            cols = {row[1] for row in conn.execute(text("PRAGMA table_info(production_batches)"))}
        self.assertIn("collection_state_json", cols)


class TestMigrationIsolation(unittest.TestCase):
    def test_failed_migration_does_not_block_manual_recovery(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))

        def _boom(_engine):
            raise RuntimeError("simulated isolated migration failure")

        failing = [
            ProductionSchemaMigration("2099.01.01.1", "simulated_failure", _boom),
        ]
        with patch("backend.db.production_schema.PRODUCTION_SCHEMA_MIGRATIONS", failing):
            applied = apply_pending_production_migrations(engine)
        self.assertEqual(applied, 0)
        self.assertIsNone(get_production_schema_version(engine))

        # Manual per-column recovery still works in isolation
        added = ensure_model_schema_sync(engine, ProductionBatch, log_prefix="test.recovery")
        self.assertGreaterEqual(added, 3)

    def test_batch_schema_sync_wrapper_delegates(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        added = ensure_production_batch_schema_sync(engine)
        self.assertGreaterEqual(added, 3)


class TestProductionSchemaStartupGate(unittest.TestCase):
    def setUp(self):
        clear_production_schema_valid()

    def test_startup_gate_adds_required_columns(self):
        engine = create_engine("sqlite:///:memory:")
        _ensure_full_production_sqlite(engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE production_batches"))
            conn.execute(text(_legacy_production_batches_sqlite()))
        result = run_production_schema_startup_gate(engine, phase="test")
        self.assertIn("collection_state_json", result["columns_after"])
        self.assertEqual(result["missing_before"], ["collecting_completed_at", "collection_state_json", "production_completed_at"])
        self.assertEqual(result["health"]["status"], "ok")
        self.assertEqual(result["health"]["production_schema_version"], PRODUCTION_SCHEMA_GENERATION)

    def test_startup_gate_fails_if_columns_still_missing(self):
        engine = create_engine("sqlite:///:memory:")
        _ensure_full_production_sqlite(engine)
        with engine.begin() as conn:
            conn.execute(text("DROP TABLE production_batches"))
            conn.execute(text(_legacy_production_batches_sqlite()))
        with (
            patch(
                "backend.db.production_schema.apply_pending_production_migrations",
                return_value=0,
            ),
            patch(
                "backend.db.production_schema.sync_production_registered_models",
                return_value=0,
            ),
            self.assertRaises(RuntimeError) as ctx,
        ):
            run_production_schema_startup_gate(engine, phase="test")
        self.assertIn("schema sync failed", str(ctx.exception).lower())


class TestProductionSchemaEvolution(unittest.TestCase):
    def test_run_audit_lists_future_tables(self):
        engine = create_engine("sqlite:///:memory:")
        report = run_production_schema_audit(engine)
        self.assertIn("production_batch_materials", report.planned_future_tables)
        self.assertIn("production_reservations", report.planned_future_tables)

    def test_insert_after_full_evolution(self):
        engine = create_engine("sqlite:///:memory:")
        now = datetime.utcnow()
        with engine.begin() as conn:
            conn.execute(text(_legacy_production_batches_sqlite()))
        ensure_production_schema_evolution(engine)
        with engine.begin() as conn:
            conn.execute(
                text(
                    """
                    INSERT INTO production_batches (
                        tenant_id, number, warehouse_id, status,
                        collection_state_json, created_at, updated_at
                    ) VALUES (1, 'BAT/2026/0099', 1, 'planned', NULL, :now, :now)
                    """
                ),
                {"now": now},
            )


if __name__ == "__main__":
    unittest.main()
