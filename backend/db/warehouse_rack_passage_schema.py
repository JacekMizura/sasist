"""Schema ensure for warehouse_rack_passages."""

from __future__ import annotations

import logging

from sqlalchemy.engine import Engine

from .schema_introspection import ensure_model_table_from_orm, sync_model_schema

logger = logging.getLogger(__name__)

WAREHOUSE_RACK_PASSAGE_SCHEMA_VERSION = "2026.07.24.rack_passage.1"


def ensure_warehouse_rack_passage_schema(engine: Engine) -> None:
    from ..models.warehouse import WarehouseRackPassage

    ensure_model_table_from_orm(engine, WarehouseRackPassage, log_prefix="schema.rack_passage")
    sync_model_schema(
        engine,
        WarehouseRackPassage,
        log_prefix="schema.rack_passage",
        sync_indexes=True,
        sync_foreign_keys=True,
    )
    logger.info(
        "[schema.rack_passage] ensured version=%s dialect=%s",
        WAREHOUSE_RACK_PASSAGE_SCHEMA_VERSION,
        engine.dialect.name,
    )
