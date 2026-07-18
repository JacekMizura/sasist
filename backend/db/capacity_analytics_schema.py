"""Ensure Capacity Analytics tables exist (SQLite + PostgreSQL)."""

from __future__ import annotations

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def ensure_capacity_analytics_tables(engine: Engine) -> None:
    from ..models.capacity_analytics import (
        CapacityAnalyticsDetail,
        CapacityAnalyticsReasonAgg,
        CapacityAnalyticsRun,
    )

    CapacityAnalyticsRun.__table__.create(bind=engine, checkfirst=True)
    CapacityAnalyticsReasonAgg.__table__.create(bind=engine, checkfirst=True)
    CapacityAnalyticsDetail.__table__.create(bind=engine, checkfirst=True)

    # Indexes (IF NOT EXISTS) for dialects that create_all may miss on existing DBs
    stmts = [
        "CREATE INDEX IF NOT EXISTS ix_cap_analytics_runs_cart_occurred "
        "ON capacity_analytics_runs (cart_id, occurred_at)",
        "CREATE INDEX IF NOT EXISTS ix_cap_analytics_runs_tenant_wh_occurred "
        "ON capacity_analytics_runs (tenant_id, warehouse_id, occurred_at)",
        "CREATE INDEX IF NOT EXISTS ix_cap_analytics_details_run_reason "
        "ON capacity_analytics_details (run_id, reason_code, id)",
        "CREATE INDEX IF NOT EXISTS ix_cap_analytics_details_order "
        "ON capacity_analytics_details (order_id, occurred_at)",
    ]
    with engine.begin() as conn:
        for sql in stmts:
            try:
                conn.execute(text(sql))
            except Exception:
                logger.debug("[capacity_analytics] index ensure skipped: %s", sql, exc_info=True)
    logger.info("[capacity_analytics] tables ensured")
