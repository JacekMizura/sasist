"""TTL worker — ASSIGNED timeout + auto-release PICKING bez potwierdzonych picków."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


def run_cart_lifecycle_worker(db: Session) -> dict[str, int]:
    from .schema_guard import require_production_schema_valid
    from backend.services.cart_picking_lifecycle_service import run_cart_lifecycle_maintenance

    require_production_schema_valid(context="run_cart_lifecycle_worker")
    result = run_cart_lifecycle_maintenance(db)
    if result.get("assigned_timeout_released") or result.get("picking_no_picks_released"):
        logger.info("cart_lifecycle_worker result=%s", result)
    return result
