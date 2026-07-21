"""
Source-location stock for MULTI quantity put + product-detail projection (SSOT).

Physical Inventory is not decremented until finalize, so unfinalized Pick rows
reserve capacity at (product, location).

Formulas
--------
PHYSICAL_LOCATION_STOCK  = SUM(Inventory.quantity) @ tenant+warehouse+product+location
                           (+ stock_disposition filter; default SALEABLE)
PENDING_PICKED_QTY       = SUM(Pick.quantity) where picked_at IS NULL
                           @ same tenant+warehouse+product+location
                           (warehouse-wide: any cart/session — shelf stock is shared)
EFFECTIVE_AVAILABLE      = max(0, PHYSICAL − PENDING)

Finalized picks (picked_at IS NOT NULL) must NOT be subtracted again — Inventory
was already mutated at finalize.

Scope note: pending is intentionally NOT cart-scoped. A draft pick from another
session already took units off the shelf operationally; showing them as available
would allow double-picking the same physical stock.
"""

from __future__ import annotations

from typing import Iterable

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


def location_pick_stock_projection_map(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_ids: Iterable[int],
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> dict[int, dict[str, float]]:
    """
    Batch SSOT for product-detail „Lokalizacje półek”.

    Returns ``{location_id: {physical, pending, effective}}``.
    Missing locations → all zeros.
    """
    lids = sorted({int(x) for x in location_ids if int(x) > 0})
    out: dict[int, dict[str, float]] = {
        lid: {"physical": 0.0, "pending": 0.0, "effective": 0.0} for lid in lids
    }
    if not lids:
        return out

    sd = normalize_stock_disposition(stock_disposition)
    inv_rows = (
        db.query(Inventory.location_id, func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id.in_(lids),
            Inventory.stock_disposition == sd,
            Inventory.quantity > 0,
        )
        .group_by(Inventory.location_id)
        .all()
    )
    for lid, qty in inv_rows:
        out[int(lid)]["physical"] = round(float(qty or 0.0), 6)

    pending_rows = (
        db.query(Pick.location_id, func.coalesce(func.sum(Pick.quantity), 0.0))
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.product_id == int(product_id),
            Pick.location_id.in_(lids),
            Pick.picked_at.is_(None),
        )
        .group_by(Pick.location_id)
        .all()
    )
    for lid, qty in pending_rows:
        out[int(lid)]["pending"] = round(float(qty or 0.0), 6)

    for lid, row in out.items():
        row["effective"] = round(max(0.0, float(row["physical"]) - float(row["pending"])), 6)
    return out
