"""
Startup ORM schema reconciliation — PostgreSQL + SQLite.

Primary migration path for column/index/FK drift (not create_all):
- CREATE TABLE for missing ORM tables (dependency order)
- ADD COLUMN for missing ORM columns
- CREATE INDEX IF NOT EXISTS for missing ORM indexes
- ADD CONSTRAINT for missing foreign keys

Non-destructive: never DROP columns/tables or reset data.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.exc import CircularDependencyError
from sqlalchemy.schema import Table

from ..database import Base
from .schema_introspection import (
    ensure_model_table_from_orm,
    log_db_engine,
    sync_model_columns,
    sync_model_foreign_keys,
    sync_model_indexes,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SchemaReconciliationResult:
    phase: str
    dialect: str
    models_synced: int
    tables_created: int
    columns_added: int
    indexes_added: int
    foreign_keys_added: int
    duration_ms: float
    errors: tuple[str, ...] = ()


def _metadata_has_fk_cycles(metadata: Any) -> bool:
    tables: dict[str, Table] = {t.name: t for t in metadata.tables.values()}
    deps: dict[str, set[str]] = {name: set() for name in tables}
    for name, table in tables.items():
        for fk in table.foreign_key_constraints:
            for elem in fk.elements:
                ref = elem.column.table.name
                if ref in tables and ref != name:
                    deps[name].add(ref)
    remaining = set(tables.keys())
    ordered_names: set[str] = set()
    while remaining:
        ready = {n for n in remaining if deps[n].issubset(ordered_names)}
        if not ready:
            return True
        ordered_names.update(ready)
        remaining -= ready
    return False


def iter_metadata_tables_ordered(metadata: Any) -> list[Table]:
    """
    Table order for DDL — referenced tables first.

    Falls back to manual topological sort when FK cycles are detected.
    """
    if _metadata_has_fk_cycles(metadata):
        return _topological_sort_tables_fallback(metadata)

    try:
        ordered = list(metadata.sorted_tables)
    except CircularDependencyError:
        return _topological_sort_tables_fallback(metadata)

    return ordered if ordered else _topological_sort_tables_fallback(metadata)


def _topological_sort_tables_fallback(metadata: Any) -> list[Table]:
    tables: dict[str, Table] = {t.name: t for t in metadata.tables.values()}
    deps: dict[str, set[str]] = {name: set() for name in tables}
    for name, table in tables.items():
        for fk in table.foreign_key_constraints:
            for elem in fk.elements:
                ref = elem.column.table.name
                if ref in tables and ref != name:
                    deps[name].add(ref)

    ordered: list[Table] = []
    remaining = set(tables.keys())
    cycle_breaks = 0
    while remaining:
        done = {t.name for t in ordered}
        ready = sorted(n for n in remaining if deps[n].issubset(done))
        if not ready:
            cycle_breaks += 1
            cycle_pick = min(remaining)
            ready = [cycle_pick]
        for name in ready:
            ordered.append(tables[name])
            remaining.remove(name)
    if cycle_breaks:
        # One summary only — never log each fk_cycle_break (Railway drops flooded logs).
        logger.warning(
            "[schema.reconcile] FK cycles detected: %s\nFallback topological sort enabled",
            cycle_breaks,
        )
    return ordered


def iter_registered_orm_models() -> list[Any]:
    """All mapped ORM classes on ``Base`` (deduplicated)."""
    seen: set[type] = set()
    models: list[Any] = []
    for mapper in Base.registry.mappers:
        cls = mapper.class_
        if cls in seen or not hasattr(cls, "__tablename__"):
            continue
        seen.add(cls)
        models.append(cls)
    return models


def reconcile_orm_schema(
    engine: Engine,
    *,
    phase: str = "startup",
    create_missing_tables: bool = True,
    sync_indexes: bool = True,
    sync_foreign_keys: bool = True,
    strict: bool = False,
) -> SchemaReconciliationResult:
    """
    Reconcile every registered ORM model against the live database.

    Phases (non-destructive, continue-on-error for FK):
    1. CREATE TABLE
    2. ADD COLUMN
    3. CREATE INDEX
    4. ADD FOREIGN KEY (last — after orphan repair)
    """
    t0 = time.perf_counter()
    dialect = engine.dialect.name
    log_prefix = f"schema.reconcile.{phase}"
    log_db_engine(engine, log=logger)

    tables_created = 0
    columns_added = 0
    indexes_added = 0
    foreign_keys_added = 0
    models_synced = 0
    errors: list[str] = []

    table_to_model: dict[str, Any] = {}
    for model in iter_registered_orm_models():
        table_to_model[str(model.__tablename__)] = model

    ordered_tables = iter_metadata_tables_ordered(Base.metadata)

    if create_missing_tables:
        for table in ordered_tables:
            model = table_to_model.get(table.name)
            if model is None:
                continue
            try:
                if ensure_model_table_from_orm(engine, model, log_prefix=log_prefix):
                    tables_created += 1
            except Exception as exc:
                msg = f"create_table:{table.name}:{exc}"
                errors.append(msg)
                logger.exception("[schema.reconcile] create_table_failed table=%s phase=%s", table.name, phase)
                if strict:
                    raise

    for table in ordered_tables:
        model = table_to_model.get(table.name)
        if model is None:
            continue
        try:
            columns_added += sync_model_columns(
                engine,
                model,
                log_prefix=log_prefix,
                strict=strict,
                errors=errors,
            )
            models_synced += 1
        except Exception as exc:
            msg = f"columns:{table.name}:{exc}"
            errors.append(msg)
            logger.exception("[schema.reconcile] columns_failed table=%s phase=%s", table.name, phase)
            if strict:
                raise

    if sync_indexes:
        for table in ordered_tables:
            model = table_to_model.get(table.name)
            if model is None:
                continue
            try:
                indexes_added += sync_model_indexes(
                    engine,
                    model,
                    log_prefix=log_prefix,
                    strict=strict,
                    errors=errors,
                )
            except Exception as exc:
                msg = f"indexes:{table.name}:{exc}"
                errors.append(msg)
                logger.exception("[schema.reconcile] indexes_failed table=%s phase=%s", table.name, phase)
                if strict:
                    raise

    if sync_foreign_keys:
        for table in ordered_tables:
            model = table_to_model.get(table.name)
            if model is None:
                continue
            try:
                foreign_keys_added += sync_model_foreign_keys(
                    engine,
                    model,
                    log_prefix=log_prefix,
                    strict=strict,
                    errors=errors,
                )
            except Exception as exc:
                msg = f"foreign_keys:{table.name}:{exc}"
                errors.append(msg)
                logger.exception("[schema.reconcile] foreign_keys_failed table=%s phase=%s", table.name, phase)
                if strict:
                    raise

    duration_ms = round((time.perf_counter() - t0) * 1000, 2)
    summary = SchemaReconciliationResult(
        phase=phase,
        dialect=dialect,
        models_synced=models_synced,
        tables_created=tables_created,
        columns_added=columns_added,
        indexes_added=indexes_added,
        foreign_keys_added=foreign_keys_added,
        duration_ms=duration_ms,
        errors=tuple(errors),
    )
    # Single startup line (avoid print+logger duplicate spam).
    logger.info(
        "[schema.reconcile] phase=%s dialect=%s models=%s tables_created=%s "
        "columns=%s indexes=%s fks=%s duration_ms=%s errors=%s",
        phase,
        dialect,
        models_synced,
        tables_created,
        columns_added,
        indexes_added,
        foreign_keys_added,
        duration_ms,
        len(errors),
    )
    return summary


def reconcile_startup_schema(engine: Engine, *, phase: str = "tier0") -> SchemaReconciliationResult:
    """Blocking startup reconciliation — safe to call on every deploy."""
    return reconcile_orm_schema(
        engine,
        phase=phase,
        create_missing_tables=True,
        sync_indexes=True,
        sync_foreign_keys=True,
        strict=False,
    )
