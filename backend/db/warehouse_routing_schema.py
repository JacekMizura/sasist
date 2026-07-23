"""Schema ensure for authored Warehouse Routing Graph tables."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import ensure_model_table_from_orm, has_table, sync_model_schema

logger = logging.getLogger(__name__)

WAREHOUSE_ROUTING_SCHEMA_VERSION = "2026.07.23.routing.2"


def _drop_legacy_ap_unique(engine: Engine) -> None:
    """Drop Stage-1 1:1 location unique if present (now 1..N via wh+loc+node)."""
    if not has_table(engine, "warehouse_routing_access_points"):
        return
    dialect = engine.dialect.name
    with engine.begin() as conn:
        if dialect == "postgresql":
            conn.execute(
                text(
                    "ALTER TABLE warehouse_routing_access_points "
                    "DROP CONSTRAINT IF EXISTS uq_warehouse_routing_access_points_wh_loc"
                )
            )
        else:
            # SQLite: unique may be an index
            conn.execute(text("DROP INDEX IF EXISTS uq_warehouse_routing_access_points_wh_loc"))
            # Also try auto-named unique index variants
            for name in (
                "ix_warehouse_routing_access_points_warehouse_id_location_id",
                "uq_warehouse_routing_access_points_wh_loc",
            ):
                conn.execute(text(f"DROP INDEX IF EXISTS {name}"))


def ensure_warehouse_routing_schema(engine: Engine) -> None:
    from ..models.warehouse_routing import (
        WarehouseRoutingAccessPoint,
        WarehouseRoutingEdge,
        WarehouseRoutingGraphMeta,
        WarehouseRoutingNode,
    )

    _drop_legacy_ap_unique(engine)

    for model in (
        WarehouseRoutingNode,
        WarehouseRoutingEdge,
        WarehouseRoutingAccessPoint,
        WarehouseRoutingGraphMeta,
    ):
        ensure_model_table_from_orm(engine, model, log_prefix="schema.warehouse_routing")
        sync_model_schema(
            engine,
            model,
            log_prefix="schema.warehouse_routing",
            sync_indexes=True,
            sync_foreign_keys=True,
        )
    logger.info(
        "[schema.warehouse_routing] ensured version=%s dialect=%s",
        WAREHOUSE_ROUTING_SCHEMA_VERSION,
        engine.dialect.name,
    )
