"""Materialize inventory document lines from frozen snapshot — SSOT for expected qty."""

from __future__ import annotations

import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.constants import (
    LINE_STATUS_OPEN,
    SCOPE_MODE_FULL,
    SNAPSHOT_KIND_STOCK,
)
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


def _dynamic_filters(filters: dict[str, Any]) -> dict[str, Any]:
    dyn = filters.get("dynamic")
    if isinstance(dyn, dict):
        return dyn
    return {}


def _scope_mode(filters: dict[str, Any]) -> str:
    return str(filters.get("scope_mode") or SCOPE_MODE_FULL).strip().lower()


def _line_matches_filters(
    *,
    filters: dict[str, Any],
    location_id: int,
    product_id: int,
    carrier_id: int | None,
    qty: float,
    loc: Location | None,
    product: Product | None,
) -> bool:
    mode = _scope_mode(filters)
    if mode == SCOPE_MODE_FULL:
        pass
    else:
        loc_ids = filters.get("location_ids") or []
        if mode == "locations" and loc_ids and int(location_id) not in {int(x) for x in loc_ids}:
            return False

        prod_ids = filters.get("product_ids") or []
        if mode == "products" and prod_ids and int(product_id) not in {int(x) for x in prod_ids}:
            return False

        carrier_ids = filters.get("carrier_ids") or []
        if mode == "carriers":
            if not carrier_ids:
                return False
            if carrier_id is None or int(carrier_id) not in {int(x) for x in carrier_ids}:
                return False

        zone_ids = filters.get("zone_ids") or []
        legacy_zone = filters.get("zone_id")
        if mode == "zones":
            zone_set = {int(x) for x in zone_ids}
            if legacy_zone is not None:
                zone_set.add(int(legacy_zone))
            if zone_set and loc is not None:
                loc_zone = getattr(loc, "operational_zone_type", None) or getattr(loc, "zone_id", None)
                if loc_zone is not None and str(loc_zone) not in {str(z) for z in zone_set}:
                    return False

        category_ids = filters.get("category_ids") or []
        category_id = filters.get("category_id")
        if mode == "categories":
            cats = {int(x) for x in category_ids}
            if category_id is not None:
                cats.add(int(category_id))
            if cats and product is not None:
                prod_cat = getattr(product, "category_id", None)
                if prod_cat is None or int(prod_cat) not in cats:
                    return False

        abc = filters.get("abc_class")
        if mode == "dynamic" and abc and product is not None:
            prod_abc = getattr(product, "abc_class", None) or getattr(product, "inventory_class", None)
            if prod_abc and str(prod_abc).upper() != str(abc).upper():
                return False

        # Cross-cutting filters (also apply when mode is not full)
        if loc_ids and int(location_id) not in {int(x) for x in loc_ids}:
            return False
        if prod_ids and int(product_id) not in {int(x) for x in prod_ids}:
            return False

    aisle = filters.get("aisle")
    if aisle and loc is not None and loc.rack_name and str(loc.rack_name) != str(aisle):
        return False
    rack = filters.get("rack")
    if rack and loc is not None:
        rack_val = getattr(loc, "rack_name", None) or getattr(loc, "rack_code", None)
        if rack_val and str(rack_val) != str(rack):
            return False

    brand_id = filters.get("brand_id")
    if brand_id is not None and product is not None:
        if getattr(product, "brand_id", None) != int(brand_id):
            return False

    dyn = _dynamic_filters(filters)
    include_zero = bool(filters.get("include_zero_stock") or dyn.get("include_zero_stock"))
    stock_gt_zero = bool(dyn.get("stock_gt_zero"))
    if stock_gt_zero and qty <= 1e-12:
        return False
    if qty <= 1e-12 and not include_zero:
        return False

    if dyn.get("missing_ean") and product is not None:
        ean = getattr(product, "ean", None) or getattr(product, "barcode", None)
        if ean and str(ean).strip():
            return False

    manufacturer_ids = dyn.get("manufacturer_ids") or []
    if manufacturer_ids and product is not None:
        mid = getattr(product, "manufacturer_id", None)
        if mid is None or int(mid) not in {int(x) for x in manufacturer_ids}:
            return False

    # no_movement_days — requires movement history; skip until wired (does not block scope)
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

    snap = get_stock_snapshot(db, document.id)
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
        carrier_id = int(row.carrier_id) if row.carrier_id is not None else None
        if loc_id not in loc_cache:
            loc_cache[loc_id] = db.query(Location).filter(Location.id == loc_id).first()
        if prod_id not in prod_cache:
            prod_cache[prod_id] = db.query(Product).filter(Product.id == prod_id).first()
        qty = float(row.quantity or 0)
        if not _line_matches_filters(
            filters=filters,
            location_id=loc_id,
            product_id=prod_id,
            carrier_id=carrier_id,
            qty=qty,
            loc=loc_cache[loc_id],
            product=prod_cache[prod_id],
        ):
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
        "[inventory_count.lines] materialized document_id=%s lines=%s snapshot_id=%s scope=%s",
        document.id,
        created,
        snap.id,
        _scope_mode(filters),
    )
    return {"lines_created": created, "snapshot_id": snap.id, "scope_mode": _scope_mode(filters)}
