"""Link existing PICKING warehouse operations to documentary WZ (no new movements)."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ...models.wms_product_warehouse_operation import WmsProductWarehouseOperation

logger = logging.getLogger(__name__)


def link_documentary_wz_to_pick_movements(
    db: Session,
    *,
    tenant_id: int,
    pick_ids: list[int],
    stock_document_id: int,
) -> int:
    """
    Backfill stock_document_id on canonical product history rows for finalized picks.

    Physical movement already exists (WmsProductWarehouseOperation PICKING + pick_id).
    Documentary WZ is settlement only — this adds the document reference, never a second decrement.
    """
    ids = sorted({int(x) for x in pick_ids if int(x) > 0})
    if not ids:
        return 0
    wz_id = int(stock_document_id)
    if wz_id <= 0:
        return 0

    rows = (
        db.query(WmsProductWarehouseOperation)
        .filter(
            WmsProductWarehouseOperation.tenant_id == int(tenant_id),
            WmsProductWarehouseOperation.pick_id.in_(ids),
            WmsProductWarehouseOperation.movement_type == "PICKING",
        )
        .all()
    )
    updated = 0
    for row in rows:
        cur = getattr(row, "stock_document_id", None)
        if cur is None:
            row.stock_document_id = wz_id
            updated += 1
        elif int(cur) != wz_id:
            logger.warning(
                "[warehouse_wz.pick_link] pick_id=%s op_id=%s already linked to wz_id=%s, skip wz_id=%s",
                getattr(row, "pick_id", None),
                getattr(row, "id", None),
                cur,
                wz_id,
            )
    if updated:
        db.flush()
    return updated
