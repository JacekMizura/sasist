"""Slotting / capacity engine — resilient schema evolution (locations occupancy columns)."""

from __future__ import annotations

import logging

from sqlalchemy.engine import Engine

from .schema_introspection import _add_column_if_missing, ensure_model_schema_sync, has_table

logger = logging.getLogger(__name__)

SLOTTING_SCHEMA_VERSION = "2026.06.08.1"


def ensure_slotting_schema(engine: Engine) -> int:
    """Add location occupancy columns and sync Location ORM."""
    added = 0
    if has_table(engine, "locations"):
        for col, ddl in (
            ("occupied_volume_dm3", "ALTER TABLE locations ADD COLUMN occupied_volume_dm3 FLOAT DEFAULT 0"),
            ("occupied_weight_kg", "ALTER TABLE locations ADD COLUMN occupied_weight_kg FLOAT DEFAULT 0"),
            (
                "capacity_utilization_percent",
                "ALTER TABLE locations ADD COLUMN capacity_utilization_percent FLOAT DEFAULT 0",
            ),
            (
                "last_capacity_recalculated_at",
                "ALTER TABLE locations ADD COLUMN last_capacity_recalculated_at TIMESTAMP",
            ),
            ("max_weight_kg", "ALTER TABLE locations ADD COLUMN max_weight_kg FLOAT"),
        ):
            if _add_column_if_missing(engine, "locations", col, ddl):
                added += 1
        try:
            from ..models.location import Location

            added += ensure_model_schema_sync(
                engine,
                Location,
                log_prefix="slotting.schema.sync",
                sync_indexes=False,
            )
        except Exception:
            logger.exception("[slotting.schema] sync_failed table=locations")
    logger.info(
        "[slotting.schema] complete version=%s columns_added=%s dialect=%s",
        SLOTTING_SCHEMA_VERSION,
        added,
        engine.dialect.name,
    )
    return added
