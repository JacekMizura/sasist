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

from ..database import Base
from .schema_introspection import (
    ensure_model_table_from_orm,
    log_db_engine,
    sync_model_schema,
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

    Runs in ``Base.metadata.sorted_tables`` order so FK targets exist first.
    """
    t0 = time.perf_counter()
    dialect = engine.dialect.name
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

    ordered_tables = list(Base.metadata.sorted_tables)

    if create_missing_tables:
        for table in ordered_tables:
            model = table_to_model.get(table.name)
            if model is None:
                continue
            try:
                if ensure_model_table_from_orm(engine, model, log_prefix=f"schema.reconcile.{phase}"):
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
            result = sync_model_schema(
                engine,
                model,
                log_prefix=f"schema.reconcile.{phase}",
                sync_indexes=sync_indexes,
                sync_foreign_keys=sync_foreign_keys,
                strict=strict,
            )
            models_synced += 1
            columns_added += result.columns_added
            indexes_added += result.indexes_added
            foreign_keys_added += result.foreign_keys_added
        except Exception as exc:
            msg = f"sync:{table.name}:{exc}"
            errors.append(msg)
            logger.exception("[schema.reconcile] sync_failed table=%s phase=%s", table.name, phase)
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
    print(
        f"[schema.reconcile] phase={phase} dialect={dialect} "
        f"models={models_synced} tables_created={tables_created} "
        f"columns={columns_added} indexes={indexes_added} fks={foreign_keys_added} "
        f"duration_ms={duration_ms} errors={len(errors)}",
        flush=True,
    )
    logger.info("[schema.reconcile] complete %s", summary)
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
