"""
Inventory allocation — FEFO + storage priority + Graph Reader visit order.

``pick_sequence`` is NOT used here (not routing SSOT).
FEFO / stock_disposition = business; visit order = Runtime Graph Reader.
"""

from __future__ import annotations

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.stock_reservation import StockReservation
from ..models.warehouse import Bin
from ..storage_types import NON_PICKABLE_STORAGE_TYPE_ALIASES, get_storage_priority
from .inventory_lot_keys import NO_EXPIRY_SENTINEL
from .pick_eligible_inventory_service import (
    is_pick_eligible_location_row,
    resolve_requires_putaway_for_warehouse,
)
from .stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    normalize_stock_disposition,
    resolve_order_item_required_disposition,
)
from .warehouse_routing.runtime_graph_reader import visit_index_map

EFFECTIVE_SEQ_UNSEQUENCED = 999999


def reserved_qty_at_lot(
    db: Session,
    tenant_id: int,
    product_id: int,
    location_id: int,
    batch_number: str,
    expiry_date,
    stock_disposition: str,
) -> float:
    sd = normalize_stock_disposition(stock_disposition)
    r = (
        db.query(func.coalesce(func.sum(StockReservation.quantity), 0))
        .filter(
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.product_id == int(product_id),
            StockReservation.location_id == int(location_id),
            StockReservation.batch_number == batch_number,
            StockReservation.expiry_date == expiry_date,
            StockReservation.stock_disposition == sd,
            StockReservation.status == "reserved",
        )
        .scalar()
    )
    return float(r or 0)


def allocate_inventory_slices_fefo_pick_path(
    db: Session,
    tenant_id: int,
    product_id: int,
    warehouse_id: int,
    need: float,
    *,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> list[tuple[Inventory, float]]:
    """
    Allocate ``need`` across inventory rows: FEFO + storage priority + graph visit order.
    Filtered by ``stock_disposition``.
    """
    if need <= 0:
        return []
    sd = normalize_stock_disposition(stock_disposition)
    requires_putaway = resolve_requires_putaway_for_warehouse(db, warehouse_id)
    stock_rows = (
        db.query(Inventory, Location, Bin.storage_type)
        .join(Location, Inventory.location_id == Location.id)
        .outerjoin(Bin, Bin.location_uuid == Location.location_uuid)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.product_id == int(product_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.stock_disposition == sd,
            Inventory.quantity > 0,
            or_(
                Bin.id.is_(None),
                Bin.storage_type.is_(None),
                ~func.lower(Bin.storage_type).in_(tuple(NON_PICKABLE_STORAGE_TYPE_ALIASES)),
            ),
        )
        .all()
    )
    candidates: list[tuple[Inventory, str | None]] = []
    for inv, loc, storage_type in stock_rows:
        if not is_pick_eligible_location_row(loc, requires_putaway=requires_putaway):
            continue
        bn = getattr(inv, "batch_number", "") or ""
        ed = getattr(inv, "expiry_date", None) or NO_EXPIRY_SENTINEL
        reserved = reserved_qty_at_lot(
            db, tenant_id, product_id, inv.location_id, bn, ed, sd
        )
        if float(inv.quantity) - reserved <= 0:
            continue
        candidates.append((inv, storage_type))
    if not candidates:
        return []
    best_priority = min(
        get_storage_priority(item[1]) or EFFECTIVE_SEQ_UNSEQUENCED for item in candidates
    )
    candidates = [
        c
        for c in candidates
        if (get_storage_priority(c[1]) or EFFECTIVE_SEQ_UNSEQUENCED) == best_priority
    ]
    vmap = visit_index_map(db, int(warehouse_id), [int(c[0].location_id) for c in candidates])
    candidates.sort(
        key=lambda item: (
            getattr(item[0], "expiry_date", None) or NO_EXPIRY_SENTINEL,
            vmap.get(int(item[0].location_id), 10**9),
            item[0].location_id,
            item[0].id,
        )
    )
    remaining = float(need)
    slices: list[tuple[Inventory, float]] = []
    for row, _storage_type in candidates:
        if remaining <= 1e-9:
            break
        bn = getattr(row, "batch_number", "") or ""
        ed = getattr(row, "expiry_date", None) or NO_EXPIRY_SENTINEL
        reserved = reserved_qty_at_lot(
            db, tenant_id, product_id, row.location_id, bn, ed, sd
        )
        avail = float(row.quantity) - reserved
        if avail <= 0:
            continue
        take = min(remaining, avail)
        slices.append((row, take))
        remaining -= take
    return slices


def required_disposition_for_order_item(db: Session, order_item_id: int | None) -> str:
    if order_item_id is None:
        return DEFAULT_STOCK_DISPOSITION
    from ..models.order_item import OrderItem

    oi = db.query(OrderItem).filter(OrderItem.id == int(order_item_id)).first()
    return resolve_order_item_required_disposition(oi)
