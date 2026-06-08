"""
Production module — resilient schema evolution (PostgreSQL + SQLite).

Principles:
- Small isolated sync transactions (no giant rollback cascades)
- Version tracking via ``schema_metadata``
- Startup audit with explicit drift reporting
- Dialect-safe type compilation only (never raw DATETIME on PostgreSQL)
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

from sqlalchemy import DateTime, text
from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateColumn

from .schema_introspection import (
    audit_model_schema,
    ensure_model_schema_sync,
    get_table_column_names,
    has_table,
)

logger = logging.getLogger(__name__)

PRODUCTION_SCHEMA_VERSION = "2026.06.04.1"
# Monotonic generation counter exposed in logs, /health/schema, and deploy verification.
PRODUCTION_SCHEMA_GENERATION = 12
SCHEMA_METADATA_KEY = "production_schema_version"
SCHEMA_METADATA_TABLE = "schema_metadata"

# Blocking gate — production_batches must have these before HTTP traffic.
REQUIRED_PRODUCTION_BATCH_COLUMNS = frozenset(
    {
        "collection_state_json",
        "collecting_completed_at",
        "production_completed_at",
    }
)


@dataclass(frozen=True)
class ProductionEntitySpec:
    """Registered production table — current ORM model or future planned entity."""

    table_name: str
    model: Any | None = None
    required: bool = True
    sync_columns: bool = True
    label: str = ""


@dataclass
class ProductionSchemaAuditReport:
    missing_tables: list[str] = field(default_factory=list)
    missing_columns: list[dict[str, str]] = field(default_factory=list)
    type_mismatches: list[dict[str, str]] = field(default_factory=list)
    nullable_mismatches: list[dict[str, str]] = field(default_factory=list)
    fk_mismatches: list[dict[str, str]] = field(default_factory=list)
    missing_indexes: list[dict[str, str]] = field(default_factory=list)
    extra_db_columns: list[dict[str, str]] = field(default_factory=list)
    planned_future_tables: list[str] = field(default_factory=list)

    @property
    def status(self) -> str:
        """Blocking drift — missing structure / columns / incompatible types."""
        if self.missing_tables or self.missing_columns or self.type_mismatches:
            return "DRIFT_DETECTED"
        if self.nullable_mismatches:
            return "DRIFT_DETECTED"
        return "OK"

    @property
    def warnings(self) -> list[str]:
        """Non-blocking findings (FK/index gaps common on SQLite dev DBs)."""
        out: list[str] = []
        if self.fk_mismatches:
            out.append(f"fk_mismatches={len(self.fk_mismatches)}")
        if self.missing_indexes:
            out.append(f"missing_indexes={len(self.missing_indexes)}")
        if self.extra_db_columns:
            out.append(f"extra_db_columns={len(self.extra_db_columns)}")
        return out

    def to_summary_dict(self) -> dict[str, Any]:
        return {
            "missing_tables": self.missing_tables,
            "missing_columns": self.missing_columns,
            "type_mismatches": self.type_mismatches,
            "nullable_mismatches": self.nullable_mismatches,
            "fk_mismatches": self.fk_mismatches,
            "missing_indexes": self.missing_indexes,
            "planned_future_tables": self.planned_future_tables,
            "warnings": self.warnings,
            "status": self.status,
        }


def _compile_datetime_type(engine: Engine) -> str:
    return str(DateTime().compile(dialect=engine.dialect))


def ensure_schema_metadata_table(engine: Engine) -> None:
    """Create ``schema_metadata`` if missing (dialect-safe timestamps)."""
    if has_table(engine, SCHEMA_METADATA_TABLE):
        return
    ts_type = _compile_datetime_type(engine)
    dialect = engine.dialect.name
    if dialect == "postgresql":
        ddl = f"""
            CREATE TABLE IF NOT EXISTS {SCHEMA_METADATA_TABLE} (
                key VARCHAR(128) PRIMARY KEY,
                version VARCHAR(64) NOT NULL,
                updated_at {ts_type} NOT NULL DEFAULT (NOW() AT TIME ZONE 'utc')
            )
        """
    else:
        ddl = f"""
            CREATE TABLE IF NOT EXISTS {SCHEMA_METADATA_TABLE} (
                key VARCHAR(128) PRIMARY KEY,
                version VARCHAR(64) NOT NULL,
                updated_at {ts_type} NOT NULL
            )
        """
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[production.schema] schema_metadata table ensured dialect=%s", dialect)


def get_production_schema_version(engine: Engine) -> str | None:
    ensure_schema_metadata_table(engine)
    with engine.connect() as conn:
        row = conn.execute(
            text(f"SELECT version FROM {SCHEMA_METADATA_TABLE} WHERE key = :key"),
            {"key": SCHEMA_METADATA_KEY},
        ).first()
    return str(row[0]).strip() if row and row[0] else None


def set_production_schema_version(engine: Engine, version: str) -> None:
    ensure_schema_metadata_table(engine)
    now = datetime.utcnow()
    with engine.begin() as conn:
        conn.execute(
            text(
                f"""
                INSERT INTO {SCHEMA_METADATA_TABLE} (key, version, updated_at)
                VALUES (:key, :version, :updated_at)
                ON CONFLICT (key) DO UPDATE SET
                    version = EXCLUDED.version,
                    updated_at = EXCLUDED.updated_at
                """
                if engine.dialect.name == "postgresql"
                else f"""
                INSERT OR REPLACE INTO {SCHEMA_METADATA_TABLE} (key, version, updated_at)
                VALUES (:key, :version, :updated_at)
                """
            ),
            {"key": SCHEMA_METADATA_KEY, "version": version, "updated_at": now},
        )
    logger.info("[production.schema] version_set version=%s", version)


def _production_entity_registry() -> list[ProductionEntitySpec]:
    from ..models.product_composition import (
        ProductComposition,
        ProductCompositionLine,
        ProductionBatch,
        ProductionBatchLine,
    )
    from ..models.production import (
        ProductionOrder,
        ProductionOrderLineSnapshot,
        ProductionRecipe,
        ProductionRecipeLine,
    )

    return [
        ProductionEntitySpec("production_batches", ProductionBatch, label="batch_header"),
        ProductionEntitySpec("production_batch_lines", ProductionBatchLine, label="batch_line"),
        ProductionEntitySpec("product_compositions", ProductComposition, label="composition"),
        ProductionEntitySpec("product_composition_lines", ProductCompositionLine, label="composition_line"),
        ProductionEntitySpec("production_recipes", ProductionRecipe, label="legacy_recipe"),
        ProductionEntitySpec("production_recipe_lines", ProductionRecipeLine, label="legacy_recipe_line"),
        ProductionEntitySpec("production_orders", ProductionOrder, label="production_order"),
        ProductionEntitySpec(
            "production_order_lines_snapshot",
            ProductionOrderLineSnapshot,
            label="order_line_snapshot",
        ),
        # Future MES-lite entities — audit only, not required yet
        ProductionEntitySpec("production_batch_materials", required=False, sync_columns=False, label="future"),
        ProductionEntitySpec("production_batch_execution", required=False, sync_columns=False, label="future"),
        ProductionEntitySpec("production_batch_events", required=False, sync_columns=False, label="future"),
        ProductionEntitySpec("production_operator_sessions", required=False, sync_columns=False, label="future"),
        ProductionEntitySpec("production_scrap", required=False, sync_columns=False, label="future"),
        ProductionEntitySpec("production_qc", required=False, sync_columns=False, label="future"),
        ProductionEntitySpec("production_reservations", required=False, sync_columns=False, label="future"),
    ]


def run_production_schema_audit(engine: Engine) -> ProductionSchemaAuditReport:
    """Full production schema health audit — report only, no mutations."""
    report = ProductionSchemaAuditReport()
    for spec in _production_entity_registry():
        if spec.model is None:
            if not spec.required and not has_table(engine, spec.table_name):
                report.planned_future_tables.append(spec.table_name)
            elif spec.required and not has_table(engine, spec.table_name):
                report.missing_tables.append(spec.table_name)
            continue

        audit = audit_model_schema(engine, spec.model)
        if not audit.get("exists"):
            if spec.required:
                report.missing_tables.append(spec.table_name)
            continue

        for col in audit.get("missing_in_db") or []:
            report.missing_columns.append({"table": spec.table_name, "column": col})
        for col in audit.get("extra_in_db") or []:
            report.extra_db_columns.append({"table": spec.table_name, "column": col})
        for item in audit.get("type_mismatches") or []:
            report.type_mismatches.append({"table": spec.table_name, **item})
        for item in audit.get("nullable_mismatches") or []:
            report.nullable_mismatches.append({"table": spec.table_name, **item})
        for item in audit.get("fk_mismatches") or []:
            report.fk_mismatches.append({"table": spec.table_name, **item})
        for item in audit.get("missing_indexes") or []:
            report.missing_indexes.append({"table": spec.table_name, **item})

    return report


def log_production_schema_audit_summary(engine: Engine, report: ProductionSchemaAuditReport) -> None:
    """Compact startup report — always printed at INFO."""
    summary = report.to_summary_dict()
    payload = json.dumps(summary, ensure_ascii=False, default=str)
    logger.info("[production.schema.audit] %s", payload)
    print(f"[production.schema.audit] {payload}", flush=True)


def _safe_engine_url(engine: Engine) -> str:
    url = str(engine.url)
    return url.split("@", 1)[-1] if "@" in url else url


def _sorted_table_columns(engine: Engine, table: str) -> list[str]:
    if not has_table(engine, table):
        return []
    return sorted(get_table_column_names(engine, table))


def sync_production_registered_models(engine: Engine, *, strict: bool = False) -> int:
    """Isolated per-column sync for all registered ORM models."""
    added = 0
    for spec in _production_entity_registry():
        if spec.model is None or not spec.sync_columns:
            continue
        if not has_table(engine, spec.table_name):
            logger.info(
                "[production.schema.sync] skip table missing table=%s label=%s",
                spec.table_name,
                spec.label,
            )
            continue
        added += ensure_model_schema_sync(
            engine,
            spec.model,
            log_prefix="production.schema.sync",
            strict=strict,
        )
    return added


@dataclass(frozen=True)
class ProductionSchemaMigration:
    version: str
    name: str
    apply: Callable[[Engine], int]


def _migration_batch_workflow_columns(engine: Engine) -> int:
    from ..models.product_composition import ProductionBatch, ProductionBatchLine

    added = 0
    if has_table(engine, "production_batches"):
        added += ensure_model_schema_sync(engine, ProductionBatch, log_prefix="production.schema.migration")
    if has_table(engine, "production_batch_lines"):
        added += ensure_model_schema_sync(engine, ProductionBatchLine, log_prefix="production.schema.migration")
    return added


PRODUCTION_SCHEMA_MIGRATIONS: list[ProductionSchemaMigration] = [
    ProductionSchemaMigration("2026.06.04.1", "batch_workflow_columns", _migration_batch_workflow_columns),
]


def _version_key(version: str) -> tuple[int, ...]:
    parts: list[int] = []
    for chunk in version.replace("-", ".").split("."):
        try:
            parts.append(int(chunk))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def apply_pending_production_migrations(engine: Engine) -> int:
    """
    Run versioned migrations not yet recorded.

    Each migration uses isolated transactions inside ``ensure_model_schema_sync``.
    """
    ensure_schema_metadata_table(engine)
    current = get_production_schema_version(engine)
    current_key = _version_key(current) if current else (0,)
    applied = 0
    latest = current

    for mig in PRODUCTION_SCHEMA_MIGRATIONS:
        if _version_key(mig.version) <= current_key:
            continue
        try:
            cols = mig.apply(engine)
            applied += cols
            logger.info(
                "[production.schema.migration] applied name=%s version=%s columns_added=%s",
                mig.name,
                mig.version,
                cols,
            )
            latest = mig.version
        except Exception:
            logger.exception(
                "[production.schema.migration] failed name=%s version=%s — later migrations skipped",
                mig.name,
                mig.version,
            )
            break

    if latest and latest != current:
        set_production_schema_version(engine, latest)
    return applied


def _verify_production_batch_required_columns(engine: Engine) -> list[str]:
    cols = get_table_column_names(engine, "production_batches")
    return sorted(REQUIRED_PRODUCTION_BATCH_COLUMNS - cols)


def _production_schema_has_blocking_drift(
    report: ProductionSchemaAuditReport,
    engine: Engine,
) -> bool:
    """Structural drift that must block startup, workers, and mark health as drift_detected."""
    if _verify_production_batch_required_columns(engine):
        return True
    if report.missing_tables:
        return True
    if report.missing_columns:
        return True
    if report.type_mismatches:
        return True
    return False


def _production_tables_checked_count() -> int:
    return sum(1 for spec in _production_entity_registry() if spec.model is not None)


def get_production_schema_health(engine: Engine) -> dict[str, Any]:
    """Read-only production schema health — no mutations (Railway / CI / support)."""
    report = run_production_schema_audit(engine)
    required_missing = _verify_production_batch_required_columns(engine)

    missing_columns = list(report.missing_columns)
    existing_pairs = {(m["table"], m["column"]) for m in missing_columns}
    for col in required_missing:
        pair = ("production_batches", col)
        if pair not in existing_pairs:
            missing_columns.append({"table": pair[0], "column": pair[1]})

    blocking = _production_schema_has_blocking_drift(report, engine)
    version_label: str | None = None
    try:
        version_label = get_production_schema_version(engine)
    except Exception:
        logger.debug("[production.schema.health] version lookup failed", exc_info=True)

    return {
        "status": "ok" if not blocking else "drift_detected",
        "dialect": engine.dialect.name,
        "production_schema_version": PRODUCTION_SCHEMA_GENERATION,
        "production_schema_version_label": version_label or PRODUCTION_SCHEMA_VERSION,
        "missing_tables": report.missing_tables,
        "missing_columns": missing_columns,
        "type_mismatches": report.type_mismatches,
        "fk_mismatches": report.fk_mismatches,
    }


def log_production_schema_startup_summary(
    engine: Engine,
    *,
    gate_result: dict[str, Any],
    report: ProductionSchemaAuditReport,
    success: bool,
) -> None:
    """Compact one-line startup audit summary for deploy logs."""
    tables_checked = _production_tables_checked_count()
    columns_added = int(gate_result.get("migration_columns_added", 0)) + int(
        gate_result.get("sync_columns_added", 0)
    )
    drift = _production_schema_has_blocking_drift(report, engine)
    status = "OK" if success and not drift else "FAILED"
    version_label = gate_result.get("version_label") or PRODUCTION_SCHEMA_VERSION
    print(
        "[production.schema.audit.summary] "
        f"status={status} "
        f"dialect={engine.dialect.name} "
        f"schema_version={PRODUCTION_SCHEMA_GENERATION} "
        f"schema_version_label={version_label} "
        f"tables_checked={tables_checked} "
        f"columns_added={columns_added} "
        f"drift_detected={str(drift).lower()}",
        flush=True,
    )
    print(f"PRODUCTION_SCHEMA_VERSION={PRODUCTION_SCHEMA_GENERATION}", flush=True)


def run_production_schema_startup_gate(engine: Engine, *, phase: str = "startup") -> dict[str, Any]:
    """
    Blocking startup gate — sync production schema and fail fast if drift remains.

    Imports ORM models directly (never via SQLite-only wrapped helpers in main.py).
    """
    print("PRODUCTION_SCHEMA_SYNC_START", flush=True)
    print(
        f"PRODUCTION_SCHEMA_DB phase={phase} dialect={engine.dialect.name} url={_safe_engine_url(engine)}",
        flush=True,
    )

    # Guarantee ORM metadata is loaded before sync.
    from .. import models as _models  # noqa: F401
    from ..models.product_composition import ProductionBatch, ProductionBatchLine

    _ = ProductionBatch.__table__
    _ = ProductionBatchLine.__table__

    before_cols = _sorted_table_columns(engine, "production_batches")
    print(f"PRODUCTION_SCHEMA_BEFORE table=production_batches columns={before_cols}", flush=True)

    missing_before = _verify_production_batch_required_columns(engine)
    if missing_before:
        print(f"PRODUCTION_SCHEMA_MISSING_BEFORE columns={missing_before}", flush=True)

    try:
        if not has_table(engine, "production_batches"):
            from .schema_upgrade import ensure_product_compositions_and_batches

            ensure_product_compositions_and_batches(engine)

        migration_cols = apply_pending_production_migrations(engine)
        sync_cols = sync_production_registered_models(engine, strict=True)

        after_cols = _sorted_table_columns(engine, "production_batches")
        print(f"PRODUCTION_SCHEMA_AFTER table=production_batches columns={after_cols}", flush=True)

        still_missing = _verify_production_batch_required_columns(engine)
        if still_missing:
            msg = (
                "production_batches schema sync failed — missing columns after sync: "
                f"{still_missing} (dialect={engine.dialect.name}, phase={phase})"
            )
            print(f"PRODUCTION_SCHEMA_SYNC_FAILED {msg}", flush=True)
            raise RuntimeError(msg)

        report = run_production_schema_audit(engine)
        if _production_schema_has_blocking_drift(report, engine):
            msg = (
                "production schema drift after sync — "
                f"missing_tables={report.missing_tables} "
                f"missing_columns={report.missing_columns} "
                f"type_mismatches={len(report.type_mismatches)} "
                f"(dialect={engine.dialect.name}, phase={phase})"
            )
            print(f"PRODUCTION_SCHEMA_SYNC_FAILED {msg}", flush=True)
            raise RuntimeError(msg)

        log_production_schema_audit_summary(engine, report)

        version_label = get_production_schema_version(engine) or PRODUCTION_SCHEMA_VERSION
        gate_result = {
            "phase": phase,
            "dialect": engine.dialect.name,
            "url": _safe_engine_url(engine),
            "columns_before": before_cols,
            "columns_after": after_cols,
            "missing_before": missing_before,
            "migration_columns_added": migration_cols,
            "sync_columns_added": sync_cols,
            "audit_status": report.status,
            "version_label": version_label,
        }
        health = get_production_schema_health(engine)
        from ..platform_state import mark_production_schema_valid

        mark_production_schema_valid(health=health)
        log_production_schema_startup_summary(
            engine,
            gate_result=gate_result,
            report=report,
            success=True,
        )

        print("PRODUCTION_SCHEMA_SYNC_DONE", flush=True)
        return {**gate_result, "health": health}
    except Exception as exc:
        print(f"PRODUCTION_SCHEMA_SYNC_FAILED {exc!r}", flush=True)
        logger.exception(
            "PRODUCTION_SCHEMA_SYNC_FAILED phase=%s dialect=%s",
            phase,
            engine.dialect.name,
        )
        raise RuntimeError("production_batches schema sync failed") from exc


def ensure_production_schema_evolution(engine: Engine) -> dict[str, Any]:
    """
    Production schema evolution entry point (startup).

    1. Ensure schema_metadata
    2. Apply pending versioned migrations (isolated)
    3. Sync all registered ORM models (isolated)
    4. Audit + log summary
    """
    dialect = engine.dialect.name
    ensure_schema_metadata_table(engine)
    before_version = get_production_schema_version(engine)

    migration_cols = apply_pending_production_migrations(engine)
    sync_cols = sync_production_registered_models(engine, strict=False)

    report = run_production_schema_audit(engine)
    log_production_schema_audit_summary(engine, report)

    after_version = get_production_schema_version(engine)
    result = {
        "dialect": dialect,
        "version_before": before_version,
        "version_after": after_version,
        "target_version": PRODUCTION_SCHEMA_VERSION,
        "migration_columns_added": migration_cols,
        "sync_columns_added": sync_cols,
        "audit_status": report.status,
        "audit": report.to_summary_dict(),
    }
    logger.info(
        "[production.schema.evolution] complete dialect=%s version=%s migration_cols=%s sync_cols=%s status=%s",
        dialect,
        after_version,
        migration_cols,
        sync_cols,
        report.status,
    )
    return result


def compile_model_column_ddl(model: Any, column_name: str, engine: Engine) -> str:
    """Expose compiled ADD COLUMN DDL for tests."""
    col = model.__table__.columns[column_name]
    col_sql = str(CreateColumn(col).compile(dialect=engine.dialect))
    return f"ALTER TABLE {model.__tablename__} ADD {col_sql}"
