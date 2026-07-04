"""Legacy MO status migration for WMS phased workflow."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ...models.production import ProductionOrder

logger = logging.getLogger(__name__)


def migrate_legacy_order_execution_statuses(db: Session) -> int:
    """
    Map legacy in_progress / putaway MO rows to WMS phases without production putaway terminal.
    Idempotent — safe to run on startup.
    """
    updated = 0
    rows = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.status.in_(("in_progress", "putaway")))
        .all()
    )
    for order in rows:
        new_status = None
        status = str(order.status or "")
        if status == "putaway":
            if order.pw_stock_document_id:
                new_status = "completed"
            elif order.rw_stock_document_id:
                new_status = "in_progress"
        elif status == "in_progress" and order.rw_stock_document_id and not order.pw_stock_document_id:
            new_status = "in_progress"
        elif status == "in_progress" and order.collection_state_json and not order.rw_stock_document_id:
            new_status = "collecting"
        elif status == "in_progress" and getattr(order, "released_to_wms_at", None) and not order.rw_stock_document_id:
            if order.collection_state_json:
                new_status = "collecting"
        if new_status and new_status != status:
            order.status = new_status
            updated += 1
    if updated:
        db.flush()
        logger.info("[production.migration] legacy order statuses updated count=%s", updated)
    return updated
