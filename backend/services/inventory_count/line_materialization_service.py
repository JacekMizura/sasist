"""Materialize inventory document lines from frozen snapshot — SSOT for expected qty."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import LINE_STATUS_OPEN, SNAPSHOT_KIND_STOCK
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.snapshot import InventorySnapshot, InventorySnapshotStockLine
from ...models.location import Location
from ...models.product import Product

logger = logging.getLogger(__name__)


def _parse_filters(doc: InventoryDocument) -> dict[str, Any]:
    if not doc.filters_json:
        return {}
    try:
        return json.loads(doc.filters_json)
    except json.JSONDecodeError:
        return {}


def _line_matches_filters(
    *,
    filters: dict[str, Any],
    location_id: int,
    product_id: int,
    loc: Location | None,
    product: Product | None,
) -> bool:
    loc_ids = filters.get("location_ids") or []
    if loc_ids and int(location_id) not in {int(x) for x in loc_ids}:
        return False
    prod_ids = filters.get("product_ids") or []
    if prod_ids and int(product_id) not in {int(x) for x in prod_ids}:
        return False
    zone_id = filters.get("zone_id")
    if zone_id is not None and loc is not None:
        if getattr(loc, "operational_zone_type", None) and str(loc.operational_zone_type) != str(zone_id):
            pass  # zone_id may be location id — skip strict zone match if not configured
    aisle = filters.get("aisle")
    if aisle and loc is not None and loc.rack_name and str(loc.rack_name) != str(aisle):
        return False
    category_id = filters.get("category_id")
    if category_id is not None and product is not None:
        if getattr(product, "category_id", None) != int(category_id):
            return False
    return True


def get_stock_snapshot(db: Session, document_id: int) -> InventorySnapshot | None:
    return (
        db.query(InventorySnapshot)
        .filter(
            InventorySnapshot.inventory_document_id == int(document_id),
            InventorySnapshot.snapshot_kind == SNAPSHOT_KIND_STOCK,
        )
        .order_by(InventorySnapshot.id.desc())
        .first()
    )


def materialize_document_lines_from_snapshot(
    db: Session,
    *,
    document: InventoryDocument,
    user_id: int | None = None,
) -> dict[str, Any]:
    """Create document lines from snapshot stock rows — expected qty frozen at snapshot time."""
    existing = (
        db.query(InventoryDocumentLine)
        .filter(InventoryDocumentLine.inventory_document_id == int(document.id))
        .count()
    )
    if existing > 0:
        return {"lines_created": 0, "skipped": "already_materialized"}

    snap = get_stock_snapshot(db, int(document.id))
    if snap is None:
        return {"lines_created": 0, "error": "no_stock_snapshot"}

    document.stock_snapshot_id = int(snap.id)
    filters = _parse_filters(document)
    stock_rows = (
        db.query(InventorySnapshotStockLine)
        .filter(InventorySnapshotStockLine.snapshot_id == int(snap.id))
        .all()
    )

    loc_cache: dict[int, Location | None] = {}
    prod_cache: dict[int, Product | None] = {}
    created = 0

    for row in stock_rows:
        loc_id = int(row.location_id)
        prod_id = int(row.product_id)
        if loc_id not in loc_cache:
            loc_cache[loc_id] = db.query(Location).filter(Location.id == loc_id).first()
        if prod_id not in prod_cache:
            prod_cache[prod_id] = db.query(Product).filter(Product.id == prod_id).first()
        if not _line_matches_filters(
            filters=filters,
            location_id=loc_id,
            product_id=prod_id,
            loc=loc_cache[loc_id],
            product=prod_cache[prod_id],
        ):
            continue
        qty = float(row.quantity or 0)
        if qty <= 1e-12 and not filters.get("include_zero_stock"):
            continue

        line = InventoryDocumentLine(
            inventory_document_id=int(document.id),
            location_id=loc_id,
            product_id=prod_id,
            expected_quantity=qty,
            batch_number=row.batch_number,
            carrier_id=row.carrier_id,
            status=LINE_STATUS_OPEN,
        )
        line.recompute_difference()
        db.add(line)
        created += 1

    db.flush()
    logger.info(
        "[inventory_count.lines] materialized document_id=%s lines=%s snapshot_id=%s",
        document.id,
        created,
        snap.id,
    )
    return {"lines_created": created, "snapshot_id": snap.id}
