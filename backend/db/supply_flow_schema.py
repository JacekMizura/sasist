"""Schema upgrade: Supply Flow operational phase + config + living plan + history."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from .schema_introspection import get_table_column_names, has_table

logger = logging.getLogger(__name__)

SUPPLY_FLOW_SCHEMA_VERSION = "2026.08.03.supply_flow_stage1_config_matrix"


def _add_column(engine: Engine, table: str, column: str, ddl_sqlite: str, ddl_pg: str) -> None:
    if not has_table(engine, table):
        return
    if column in get_table_column_names(engine, table):
        return
    ddl = ddl_pg if engine.dialect.name == "postgresql" else ddl_sqlite
    with engine.begin() as conn:
        conn.execute(text(ddl))
    logger.info("[supply_flow] added %s.%s", table, column)


def _drop_column_if_exists(engine: Engine, table: str, column: str) -> None:
    if not has_table(engine, table):
        return
    if column not in get_table_column_names(engine, table):
        return
    pg = engine.dialect.name == "postgresql"
    with engine.begin() as conn:
        if pg:
            conn.execute(text(f'ALTER TABLE {table} DROP COLUMN IF EXISTS {column}'))
        else:
            # SQLite 3.35+
            conn.execute(text(f"ALTER TABLE {table} DROP COLUMN {column}"))
    logger.info("[supply_flow] dropped %s.%s", table, column)


def ensure_supply_flow_schema(engine: Engine) -> None:
    """
    Idempotent: deliveries.operational_phase + history + warehouse config + living plans.

    Does NOT seed/sync purchase status → operational_phase (separate axes + matrix).
    """
    _add_column(
        engine,
        "deliveries",
        "operational_phase",
        "ALTER TABLE deliveries ADD COLUMN operational_phase VARCHAR(64) NOT NULL DEFAULT 'AWIZOWANA'",
        "ALTER TABLE deliveries ADD COLUMN operational_phase VARCHAR(64) NOT NULL DEFAULT 'AWIZOWANA'",
    )
    _add_column(
        engine,
        "deliveries",
        "operational_phase_changed_at",
        "ALTER TABLE deliveries ADD COLUMN operational_phase_changed_at DATETIME",
        "ALTER TABLE deliveries ADD COLUMN operational_phase_changed_at TIMESTAMP",
    )

    if has_table(engine, "deliveries"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_deliveries_operational_phase "
                    "ON deliveries(operational_phase)"
                )
            )

    pg = engine.dialect.name == "postgresql"

    if not has_table(engine, "supply_flow_phase_history"):
        bool_default = "TRUE" if pg else "1"
        id_col = "id SERIAL PRIMARY KEY" if pg else "id INTEGER NOT NULL PRIMARY KEY"
        ts = "TIMESTAMP" if pg else "DATETIME"
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE supply_flow_phase_history (
                        {id_col},
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        delivery_id INTEGER NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
                        from_phase VARCHAR(64),
                        to_phase VARCHAR(64) NOT NULL,
                        changed_at {ts} NOT NULL,
                        user_id INTEGER,
                        source VARCHAR(64) NOT NULL DEFAULT 'system',
                        comment TEXT,
                        is_automatic BOOLEAN NOT NULL DEFAULT {bool_default}
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sf_phase_history_delivery_id "
                    "ON supply_flow_phase_history(delivery_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sf_phase_history_tenant_id "
                    "ON supply_flow_phase_history(tenant_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sf_phase_history_to_phase "
                    "ON supply_flow_phase_history(to_phase)"
                )
            )
        logger.info("[supply_flow] created supply_flow_phase_history")

    if not has_table(engine, "supply_flow_warehouse_configs"):
        id_col = "id SERIAL PRIMARY KEY" if pg else "id INTEGER NOT NULL PRIMARY KEY"
        ts = "TIMESTAMP" if pg else "DATETIME"
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE supply_flow_warehouse_configs (
                        {id_col},
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        optimization_goal VARCHAR(64) NOT NULL DEFAULT 'MAX_SHIPPED_ORDERS',
                        planning_horizon_hours INTEGER NOT NULL DEFAULT 24,
                        created_at {ts} NOT NULL,
                        updated_at {ts} NOT NULL,
                        CONSTRAINT uq_supply_flow_warehouse_configs_tenant_wh
                            UNIQUE (tenant_id, warehouse_id)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sf_wh_cfg_tenant_id "
                    "ON supply_flow_warehouse_configs(tenant_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_sf_wh_cfg_warehouse_id "
                    "ON supply_flow_warehouse_configs(warehouse_id)"
                )
            )
        logger.info("[supply_flow] created supply_flow_warehouse_configs")

    if not has_table(engine, "supply_flow_plans"):
        id_col = "id SERIAL PRIMARY KEY" if pg else "id INTEGER NOT NULL PRIMARY KEY"
        ts = "TIMESTAMP" if pg else "DATETIME"
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"""
                    CREATE TABLE supply_flow_plans (
                        {id_col},
                        tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
                        warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                        plan_version INTEGER NOT NULL DEFAULT 1,
                        computed_at {ts} NOT NULL,
                        projection_json TEXT NOT NULL DEFAULT '{{}}',
                        cta_json TEXT,
                        next_action_json TEXT,
                        last_recompute_trigger VARCHAR(64),
                        created_at {ts} NOT NULL,
                        updated_at {ts} NOT NULL,
                        CONSTRAINT uq_supply_flow_plans_tenant_warehouse UNIQUE (tenant_id, warehouse_id)
                    )
                    """
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_supply_flow_plans_tenant_id "
                    "ON supply_flow_plans(tenant_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_supply_flow_plans_warehouse_id "
                    "ON supply_flow_plans(warehouse_id)"
                )
            )
        logger.info("[supply_flow] created supply_flow_plans")
    else:
        # Migrate legacy plan-owned config → warehouse config, then drop plan columns.
        cols = get_table_column_names(engine, "supply_flow_plans")
        if "optimization_goal" in cols or "planning_horizon_hours" in cols:
            with engine.begin() as conn:
                conn.execute(
                    text(
                        """
                        INSERT INTO supply_flow_warehouse_configs (
                            tenant_id, warehouse_id, optimization_goal,
                            planning_horizon_hours, created_at, updated_at
                        )
                        SELECT
                            p.tenant_id,
                            p.warehouse_id,
                            COALESCE(p.optimization_goal, 'MAX_SHIPPED_ORDERS'),
                            COALESCE(p.planning_horizon_hours, 24),
                            COALESCE(p.created_at, CURRENT_TIMESTAMP),
                            COALESCE(p.updated_at, CURRENT_TIMESTAMP)
                        FROM supply_flow_plans p
                        WHERE NOT EXISTS (
                            SELECT 1 FROM supply_flow_warehouse_configs c
                            WHERE c.tenant_id = p.tenant_id
                              AND c.warehouse_id = p.warehouse_id
                        )
                        """
                    )
                )
            _drop_column_if_exists(engine, "supply_flow_plans", "optimization_goal")
            _drop_column_if_exists(engine, "supply_flow_plans", "planning_horizon_hours")

    logger.info("[supply_flow] schema ok version=%s", SUPPLY_FLOW_SCHEMA_VERSION)
