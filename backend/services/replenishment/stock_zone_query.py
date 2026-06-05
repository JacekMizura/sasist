"""Sum saleable inventory by operational zone type."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location


def qty_by_zone_for_product(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> dict[str, float]:
    rows = (
        db.query(Location.operational_zone_type, func.sum(Inventory.quantity))
        .join(Location, Location.id == Inventory.location_id)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.stock_disposition == "SALEABLE",
            Inventory.quantity > 0,
        )
        .group_by(Location.operational_zone_type)
        .all()
    )
    out: dict[str, float] = {}
    for zone, qty in rows:
        key = str(zone or "BACKROOM").strip().upper()
        out[key] = out.get(key, 0.0) + float(qty or 0)
    return out
