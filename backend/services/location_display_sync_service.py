"""Synchronize denormalized location display names after layout/bin rename."""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.stock_document import StockDocumentItem

logger = logging.getLogger(__name__)


def sync_location_display_fields(
    db: Session,
    *,
    warehouse_id: int,
    location_id: int,
    display_name: str,
    location_uuid: str | None = None,
    previous_name: str | None = None,
) -> None:
    """
    Keep operational labels aligned when a bin/location is renamed.

    Updates:
    - ``locations.name`` (when changed) — inventory API, reservations, pick routes,
      and stock movements resolve display names from this row at read time
    - ``stock_document_items.putaway_last_location_name`` (denormalized UX field)
    - Layout barcode payloads use synced ``bin.label`` from the designer save path
    """
    name = (display_name or "").strip()
    if not name or int(location_id) <= 0:
        return

    loc = (
        db.query(Location)
        .filter(
            Location.id == int(location_id),
            Location.warehouse_id == int(warehouse_id),
        )
        .first()
    )
    if loc is None:
        logger.warning(
            "[location.display.sync] missing Location id=%s warehouse_id=%s uuid=%s",
            location_id,
            warehouse_id,
            location_uuid,
        )
        return

    old_name = (previous_name or loc.name or "").strip()
    if (loc.name or "").strip() != name:
        loc.name = name
    if location_uuid:
        nu = str(location_uuid).strip()
        if nu:
            loc.location_uuid = nu
    loc.is_active = True
    db.flush()

    if not old_name or old_name == name:
        return

    try:
        putaway_rows = (
            db.query(StockDocumentItem)
            .filter(StockDocumentItem.putaway_last_location_name == old_name)
            .update({"putaway_last_location_name": name[:256]}, synchronize_session=False)
        )
        if putaway_rows:
            logger.info(
                "[location.display.sync] putaway_last_location_name rows=%s %s -> %s location_id=%s",
                putaway_rows,
                old_name,
                name,
                location_id,
            )
    except Exception:
        logger.exception(
            "[location.display.sync] putaway_last_location_name update failed location_id=%s",
            location_id,
        )

    logger.info(
        "[location.display.sync] location_id=%s warehouse_id=%s uuid=%s name=%s",
        location_id,
        warehouse_id,
        location_uuid,
        name,
    )
