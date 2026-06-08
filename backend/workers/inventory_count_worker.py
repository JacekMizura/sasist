"""Process pending inventory background jobs (reports, audit packages)."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from backend.services.inventory_count.job_service import process_pending_inventory_jobs

logger = logging.getLogger(__name__)


def run_inventory_count_jobs(db: Session, *, limit: int = 5) -> int:
    processed = process_pending_inventory_jobs(db, limit=limit)
    if processed:
        logger.info("[inventory.worker] processed_jobs=%s", processed)
    return processed
