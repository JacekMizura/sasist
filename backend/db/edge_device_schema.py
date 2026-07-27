"""Edge Device Registry schema evolution (Tier 1)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

EDGE_DEVICE_SCHEMA_VERSION = "2026.07.27.2"


@dataclass(frozen=True)
class EdgeEntitySpec:
    table_name: str
    model: Any


def _registry() -> list[EdgeEntitySpec]:
    from ..models.agent import EdgeDevice, EdgeDeviceAction, EdgeDeviceEvent

    return [
        EdgeEntitySpec("edge_devices", EdgeDevice),
        EdgeEntitySpec("edge_device_events", EdgeDeviceEvent),
        EdgeEntitySpec("edge_device_actions", EdgeDeviceAction),
    ]


def _create_table_from_model(engine: Engine, model: Any) -> None:
    from sqlalchemy import text

    ddl = str(CreateTable(model.__table__).compile(dialect=engine.dialect))
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info(
        "[edge.schema] created_table table=%s dialect=%s",
        model.__tablename__,
        engine.dialect.name,
    )


def ensure_edge_device_schema(engine: Engine) -> int:
    added = 0
    for spec in _registry():
        if not has_table(engine, spec.table_name):
            try:
                _create_table_from_model(engine, spec.model)
            except Exception:
                logger.exception("[edge.schema] create_table_failed table=%s", spec.table_name)
                continue
        try:
            added += ensure_model_schema_sync(
                engine,
                spec.model,
                sync_indexes=True,
                log_prefix="edge.schema.sync",
            )
        except Exception:
            logger.exception("[edge.schema] sync_failed table=%s", spec.table_name)
    logger.info(
        "[edge.schema] ensure_complete version=%s columns_added=%s",
        EDGE_DEVICE_SCHEMA_VERSION,
        added,
    )
    return added
