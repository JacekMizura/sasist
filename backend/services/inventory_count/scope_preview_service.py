"""Preview inventory scope before document start — location/product counts from live stock."""

from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ...models.product import Product
from ...models.inventory_count.document import InventoryDocument
from .line_materialization_service import (
    line_matches_inventory_filters,
    parse_document_filters,
    scope_mode_from_filters,
)


def preview_inventory_scope(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    filters: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Estimate scoped lines from current warehouse stock (pre-snapshot)."""
    parsed = dict(filters or {})
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
        )
        .all()
    )

    loc_cache: dict[int, Location | None] = {}
    prod_cache: dict[int, Product | None] = {}
    matched_lines = 0
    location_ids: set[int] = set()
    product_ids: set[int] = set()

    for inv in rows:
        loc_id = int(inv.location_id)
        prod_id = int(inv.product_id)
        qty = float(inv.quantity or 0)
        carrier_id = int(inv.carrier_id) if inv.carrier_id is not None else None
        if loc_id not in loc_cache:
            loc_cache[loc_id] = db.query(Location).filter(Location.id == loc_id).first()
        if prod_id not in prod_cache:
            prod_cache[prod_id] = db.query(Product).filter(Product.id == prod_id).first()
        if not line_matches_inventory_filters(
            filters=parsed,
            location_id=loc_id,
            product_id=prod_id,
            carrier_id=carrier_id,
            qty=qty,
            loc=loc_cache[loc_id],
            product=prod_cache[prod_id],
        ):
            continue
        matched_lines += 1
        location_ids.add(loc_id)
        product_ids.add(prod_id)

    return {
        "scope_mode": scope_mode_from_filters(parsed),
        "location_count": len(location_ids),
        "product_count": len(product_ids),
        "line_count": matched_lines,
        "warehouse_id": int(warehouse_id),
    }


def preview_document_scope(db: Session, *, document: InventoryDocument) -> dict[str, Any]:
    return preview_inventory_scope(
        db,
        tenant_id=int(document.tenant_id),
        warehouse_id=int(document.warehouse_id),
        filters=parse_document_filters(document),
    )
