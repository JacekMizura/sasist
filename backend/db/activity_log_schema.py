"""Ensure activity_events + activity_event_links tables exist."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def ensure_activity_log_tables(engine: Engine) -> None:
    from .schema_introspection import has_table

    dialect = engine.dialect.name

    if not has_table(engine, "activity_events"):
        with engine.begin() as conn:
            if dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE activity_events (
                            id SERIAL PRIMARY KEY,
                            tenant_id INTEGER REFERENCES tenants(id),
                            warehouse_id INTEGER REFERENCES warehouses(id),
                            event_code VARCHAR(64) NOT NULL,
                            description VARCHAR(512) NOT NULL,
                            severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
                            category VARCHAR(32) NOT NULL DEFAULT 'system',
                            actor_user_id INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
                            occurred_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
                            source_module VARCHAR(64),
                            correlation_id VARCHAR(64),
                            metadata_json TEXT
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE activity_events (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            tenant_id INTEGER,
                            warehouse_id INTEGER,
                            event_code VARCHAR(64) NOT NULL,
                            description VARCHAR(512) NOT NULL,
                            severity VARCHAR(16) NOT NULL DEFAULT 'INFO',
                            category VARCHAR(32) NOT NULL DEFAULT 'system',
                            actor_user_id INTEGER,
                            occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            source_module VARCHAR(64),
                            correlation_id VARCHAR(64),
                            metadata_json TEXT
                        )
                        """
                    )
                )
            for idx_sql in (
                "CREATE INDEX IF NOT EXISTS ix_activity_events_tenant_wh_occurred "
                "ON activity_events(tenant_id, warehouse_id, occurred_at)",
                "CREATE INDEX IF NOT EXISTS ix_activity_events_code_occurred "
                "ON activity_events(event_code, occurred_at)",
                "CREATE INDEX IF NOT EXISTS ix_activity_events_category ON activity_events(category)",
                "CREATE INDEX IF NOT EXISTS ix_activity_events_severity ON activity_events(severity)",
            ):
                try:
                    conn.execute(text(idx_sql))
                except Exception:
                    pass
        logger.info("[activity_log] created activity_events")

    if not has_table(engine, "activity_event_links"):
        with engine.begin() as conn:
            if dialect == "postgresql":
                conn.execute(
                    text(
                        """
                        CREATE TABLE activity_event_links (
                            id SERIAL PRIMARY KEY,
                            event_id INTEGER NOT NULL REFERENCES activity_events(id) ON DELETE CASCADE,
                            object_type VARCHAR(32) NOT NULL,
                            object_id INTEGER NOT NULL,
                            role VARCHAR(24) NOT NULL DEFAULT 'related',
                            object_label VARCHAR(128),
                            CONSTRAINT uq_activity_event_link_object
                                UNIQUE (event_id, object_type, object_id)
                        )
                        """
                    )
                )
            else:
                conn.execute(
                    text(
                        """
                        CREATE TABLE activity_event_links (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            event_id INTEGER NOT NULL,
                            object_type VARCHAR(32) NOT NULL,
                            object_id INTEGER NOT NULL,
                            role VARCHAR(24) NOT NULL DEFAULT 'related',
                            object_label VARCHAR(128),
                            UNIQUE (event_id, object_type, object_id)
                        )
                        """
                    )
                )
            try:
                conn.execute(
                    text(
                        "CREATE INDEX IF NOT EXISTS ix_activity_event_links_object "
                        "ON activity_event_links(object_type, object_id, event_id)"
                    )
                )
            except Exception:
                pass
        logger.info("[activity_log] created activity_event_links")
