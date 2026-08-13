"""Periodic production PLANNING stock replenishment (Phase 9)."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def run_production_stock_replenishment_worker(db: Session) -> dict:
    """Tick due auto-replenishment jobs via shared operational loop."""
    from .schema_guard import require_production_schema_valid
    from ..services.production_planning.auto_replenishment_scheduler import (
        run_due_stock_replenishment_jobs,
    )

    require_production_schema_valid(context="run_production_stock_replenishment_worker")
    result = run_due_stock_replenishment_jobs(db)
    if result.get("ran") or result.get("errors"):
        logger.info(
            "production_stock_replenishment_worker targets=%s ran=%s skipped_not_due=%s errors=%s",
            result.get("targets"),
            result.get("ran"),
            result.get("skipped_not_due"),
            result.get("errors"),
        )
    return result
