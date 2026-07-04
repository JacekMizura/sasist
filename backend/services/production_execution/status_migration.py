"""Legacy MO status migration for WMS phased workflow."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ...models.production import ProductionOrder

logger = logging.getLogger(__name__)


def migrate_legacy_order_execution_statuses(db: Session) -> int:
    """
    Map legacy in_progress MO rows to collecting / putaway when WMS phase fields imply it.
    Idempotent — safe to run on startup.
    """
    updated = 0
    rows = (
        db.query(ProductionOrder)
        .filter(ProductionOrder.status == "in_progress")
        .all()
    )
    for order in rows:
        new_status = None
        if order.rw_stock_document_id and not order.pw_stock_document_id:
            new_status = "putaway"
        elif order.collection_state_json and not order.rw_stock_document_id:
            new_status = "collecting"
        elif getattr(order, "released_to_wms_at", None) and not order.rw_stock_document_id:
            if order.collection_state_json:
                new_status = "collecting"
            # else stay in_progress until operator starts collecting
        if new_status and new_status != str(order.status):
            order.status = new_status
            updated += 1
    if updated:
        db.flush()
        logger.info("[production.migration] legacy order statuses updated count=%s", updated)
    return updated
