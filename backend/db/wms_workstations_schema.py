"""WMS workstations schema evolution (Tier 1)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

WMS_WORKSTATIONS_SCHEMA_VERSION = "2026.07.28.2"


@dataclass(frozen=True)
class _EntitySpec:
    table_name: str
    model: Any


def _registry() -> list[_EntitySpec]:
    from ..models.wms_workstations import (
        WmsWorkstation,
        WorkstationEvent,
        WorkstationPrinterMapping,
    )

    return [
        _EntitySpec("wms_workstations", WmsWorkstation),
        _EntitySpec("wms_workstation_printer_mappings", WorkstationPrinterMapping),
        _EntitySpec("wms_workstation_events", WorkstationEvent),
    ]


def _create_table_from_model(engine: Engine, model: Any) -> None:
    from sqlalchemy import text

    ddl = str(CreateTable(model.__table__).compile(dialect=engine.dialect))
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[wms_workstations.schema] created_table table=%s dialect=%s",
        model.__tablename__,
        engine.dialect.name,
    )


def ensure_wms_workstations_schema(engine: Engine) -> int:
    """Create missing workstation tables and sync ORM columns. Returns columns added."""
    from ..services.wms_workstations.migration import ensure_data_migrations_table

    ensure_data_migrations_table(engine)

    added = 0
    for spec in _registry():
        if not has_table(engine, spec.table_name):
            try:
                _create_table_from_model(engine, spec.model)
            except Exception:
                logger.exception(
                    "[wms_workstations.schema] create_table_failed table=%s",
                    spec.table_name,
                )
                continue
        try:
            added += ensure_model_schema_sync(
                engine,
                spec.model,
                sync_indexes=True,
                log_prefix="wms_workstations.schema.sync",
            )
        except Exception:
            logger.exception(
                "[wms_workstations.schema] sync_failed table=%s",
                spec.table_name,
            )
    logger.info(
        "[wms_workstations.schema] ensure_complete version=%s columns_added=%s",
        WMS_WORKSTATIONS_SCHEMA_VERSION,
        added,
    )
    return added
