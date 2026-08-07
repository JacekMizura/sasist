"""Read packaging stock exclusively from Inventory (no scalar catalog counters)."""

from __future__ import annotations

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory


def packaging_inventory_quantity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: Optional[int] = None,
) -> float:
    q = db.query(func.coalesce(func.sum(Inventory.quantity), 0.0)).filter(
        Inventory.tenant_id == int(tenant_id),
        Inventory.warehouse_id == int(warehouse_id),
        Inventory.product_id == int(product_id),
    )
    if location_id is not None:
        q = q.filter(Inventory.location_id == int(location_id))
    return float(q.scalar() or 0.0)


def packaging_inventory_by_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
) -> list[tuple[int, float]]:
    rows = (
        db.query(Inventory.location_id, func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
        )
        .group_by(Inventory.location_id)
        .all()
    )
    return [(int(lid), float(qty)) for lid, qty in rows if lid is not None]
