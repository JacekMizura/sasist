"""Net availability for reservation allocation (on-hand minus external reservations)."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.stock_reservation import StockReservation
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from ..pick_eligible_inventory_service import (
    is_pick_eligible_location_row,
    resolve_requires_putaway_for_warehouse,
)
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition


def _reservation_query(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    warehouse_id: int | None = None,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
):
    q = db.query(StockReservation).filter(
        StockReservation.tenant_id == int(tenant_id),
        StockReservation.product_id == int(product_id),
        StockReservation.status == "reserved",
    )
    if warehouse_id is not None:
        q = q.filter(StockReservation.warehouse_id == int(warehouse_id))
    if exclude_batch_id is not None:
        q = q.filter(
            (StockReservation.production_batch_id.is_(None))
            | (StockReservation.production_batch_id != int(exclude_batch_id))
        )
    if exclude_order_id is not None:
        q = q.filter(
            (StockReservation.production_order_id.is_(None))
            | (StockReservation.production_order_id != int(exclude_order_id))
        )
    return q


def reserved_qty_at_lot_excluding_consumer(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    location_id: int,
    batch_number: str,
    expiry_date,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    warehouse_id: int | None = None,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
) -> float:
    sd = normalize_stock_disposition(stock_disposition)
    bn = normalize_batch_number(batch_number)
    q = _reservation_query(
        db,
        tenant_id=tenant_id,
        product_id=product_id,
        warehouse_id=warehouse_id,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
    )
    rows = q.filter(
        StockReservation.location_id == int(location_id),
        StockReservation.batch_number == bn,
        StockReservation.expiry_date == expiry_date,
        StockReservation.stock_disposition == sd,
    ).all()
    return sum(float(r.quantity or 0) for r in rows)


def warehouse_net_available(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
) -> float:
    """Physical on-hand minus active reservations (excluding own production job)."""
    on_hand = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.quantity > 0,
            Inventory.stock_disposition == DEFAULT_STOCK_DISPOSITION,
        )
        .scalar()
    )
    reserved = (
        _reservation_query(
            db,
            tenant_id=tenant_id,
            product_id=product_id,
            warehouse_id=warehouse_id,
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
        .with_entities(func.coalesce(func.sum(StockReservation.quantity), 0.0))
        .scalar()
    )
    return max(0.0, float(on_hand or 0) - float(reserved or 0))


def iter_allocatable_inventory_rows(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    strategy: str,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
):
    """Yield (inventory_row, net_available_qty) sorted by strategy."""
    sd = normalize_stock_disposition(stock_disposition)
    requires_putaway = resolve_requires_putaway_for_warehouse(db, int(warehouse_id))
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.stock_disposition == sd,
            Inventory.quantity > 1e-9,
            Inventory.location_id.isnot(None),
        )
        .all()
    )
    loc_ids = {int(r.location_id) for r in rows if r.location_id}
    from ...models.location import Location

    locs = {l.id: l for l in db.query(Location).filter(Location.id.in_(loc_ids)).all()} if loc_ids else {}

    candidates: list[tuple[Inventory, float]] = []
    for inv in rows:
        lid = int(inv.location_id)
        loc = locs.get(lid)
        if loc is None or not is_pick_eligible_location_row(loc, requires_putaway=requires_putaway):
            continue
        bn = normalize_batch_number(getattr(inv, "batch_number", None))
        ed = getattr(inv, "expiry_date", None) or NO_EXPIRY_SENTINEL
        reserved = reserved_qty_at_lot_excluding_consumer(
            db,
            tenant_id=tenant_id,
            product_id=product_id,
            location_id=lid,
            batch_number=bn,
            expiry_date=ed,
            stock_disposition=sd,
            warehouse_id=warehouse_id,
            exclude_batch_id=exclude_batch_id,
            exclude_order_id=exclude_order_id,
        )
        net = float(inv.quantity or 0) - reserved
        if net > 1e-9:
            candidates.append((inv, net))

    strat = (strategy or "FEFO").upper()
    if strat == "LIFO":
        candidates.sort(key=lambda x: (getattr(x[0], "expiry_date", NO_EXPIRY_SENTINEL), -int(x[0].id)), reverse=True)
    elif strat == "FIFO":
        candidates.sort(key=lambda x: (int(x[0].id),))
    else:
        candidates.sort(key=lambda x: (getattr(x[0], "expiry_date", NO_EXPIRY_SENTINEL), int(x[0].id)))
    return candidates
