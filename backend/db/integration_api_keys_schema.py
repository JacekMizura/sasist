"""
Integration API keys — resilient schema evolution (PostgreSQL + SQLite).

Tier 1 operational module: failures must not block core OMS/WMS startup.
"""

from __future__ import annotations

import logging

from sqlalchemy.engine import Engine
from sqlalchemy.schema import CreateTable

from .schema_introspection import ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

INTEGRATION_API_KEYS_SCHEMA_VERSION = "2026.07.12.2"


def ensure_integration_api_keys_schema(engine: Engine) -> int:
    from ..models.integration_api_key import IntegrationApiKey

    table_name = IntegrationApiKey.__tablename__
    if not has_table(engine, table_name):
        try:
            ddl = str(CreateTable(IntegrationApiKey.__table__).compile(dialect=engine.dialect))
            from sqlalchemy import text

            with engine.begin() as conn:
                conn.execute(text(ddl))
            logger.info("[api_keys.schema] created_table table=%s", table_name)
        except Exception:
            logger.exception("[api_keys.schema] create_table_failed table=%s", table_name)
            return 0

    try:
        added = ensure_model_schema_sync(
            engine,
            IntegrationApiKey,
            log_prefix="api_keys.schema.sync",
            sync_indexes=True,
        )
    except Exception:
        logger.exception("[api_keys.schema] sync_failed table=%s", table_name)
        return 0

    logger.info(
        "[api_keys.schema] ensure_complete version=%s columns_added=%s",
        INTEGRATION_API_KEYS_SCHEMA_VERSION,
        added,
    )
    return added
