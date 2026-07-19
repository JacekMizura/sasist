"""
Source-location stock for MULTI quantity put (write-time SSOT).

Physical Inventory is not decremented until finalize, so unfinalized Pick rows
reserve capacity at (product, location).
"""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.pick import Pick
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition


def on_hand_qty_at_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    for_update: bool = False,
) -> float:
    sd = normalize_stock_disposition(stock_disposition)
    q = db.query(func.coalesce(func.sum(Inventory.quantity), 0.0)).filter(
        Inventory.tenant_id == int(tenant_id),
        Inventory.warehouse_id == int(warehouse_id),
        Inventory.product_id == int(product_id),
        Inventory.location_id == int(location_id),
        Inventory.stock_disposition == sd,
        Inventory.quantity > 0,
    )
    if for_update:
        # Lock matching inventory rows so concurrent puts serialize on stock.
        (
            db.query(Inventory.id)
            .filter(
                Inventory.tenant_id == int(tenant_id),
                Inventory.warehouse_id == int(warehouse_id),
                Inventory.product_id == int(product_id),
                Inventory.location_id == int(location_id),
                Inventory.stock_disposition == sd,
                Inventory.quantity > 0,
            )
            .with_for_update()
            .all()
        )
    return float(q.scalar() or 0.0)


def pending_pick_qty_at_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
) -> float:
    """SUM of draft picks (picked_at IS NULL) that will consume this location at finalize."""
    total = (
        db.query(func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.product_id == int(product_id),
            Pick.location_id == int(location_id),
            Pick.picked_at.is_(None),
        )
        .scalar()
    )
    return float(total or 0.0)


def effective_pickable_qty_at_location(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    for_update: bool = True,
) -> float:
    """
    effective_available = on_hand Inventory − SUM(unfinalized Pick @ product+location).
    """
    on_hand = on_hand_qty_at_location(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=location_id,
        stock_disposition=stock_disposition,
        for_update=for_update,
    )
    pending = pending_pick_qty_at_location(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        location_id=location_id,
    )
    return max(0.0, float(on_hand) - float(pending))
