"""Schema ensure for authored Warehouse Routing Graph tables.

Target schema from first production deploy: access points are 1..N per location
(unique on warehouse_id + location_id + node_uuid). No intermediate 1:1 unique.
"""

from __future__ import annotations

import logging

from sqlalchemy.engine import Engine

from .schema_introspection import ensure_model_table_from_orm, sync_model_schema

logger = logging.getLogger(__name__)

WAREHOUSE_ROUTING_SCHEMA_VERSION = "2026.07.23.routing.3"


def ensure_warehouse_routing_schema(engine: Engine) -> None:
    from ..models.warehouse_routing import (
        WarehouseRoutingAccessPoint,
        WarehouseRoutingEdge,
        WarehouseRoutingGraphMeta,
        WarehouseRoutingNode,
    )

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
