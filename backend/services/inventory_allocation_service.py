"""
Inventory allocation — FEFO pick path, FIFO consume, reservation qty per lot+disposition.

Etap 2 SSOT for matching ``OrderItem.required_stock_disposition`` to ``inventory.stock_disposition``.
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
from .stock_disposition import (
    DEFAULT_STOCK_DISPOSITION,
    normalize_stock_disposition,
    resolve_order_item_required_disposition,
)

EFFECTIVE_SEQ_UNSEQUENCED = 999999


def _effective_pick_sequence(pick_sequence: int | None) -> int:
    return pick_sequence if pick_sequence is not None else EFFECTIVE_SEQ_UNSEQUENCED


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
    current_pick_sequence: int,
    *,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> tuple[list[tuple[Inventory, float]], int]:
    """
    Allocate ``need`` across inventory rows: FEFO + pick path, filtered by ``stock_disposition``.
    """
    if need <= 0:
        return ([], current_pick_sequence)
    sd = normalize_stock_disposition(stock_disposition)
    stock_rows = (
        db.query(Inventory, Location.pick_sequence, Bin.storage_type)
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
    candidates: list[tuple[Inventory, int | None, str | None]] = []
    for row, pick_sequence, storage_type in stock_rows:
        bn = getattr(row, "batch_number", "") or ""
        ed = getattr(row, "expiry_date", None) or NO_EXPIRY_SENTINEL
        reserved = reserved_qty_at_lot(
            db, tenant_id, product_id, row.location_id, bn, ed, sd
        )
        if float(row.quantity) - reserved <= 0:
            continue
        candidates.append((row, pick_sequence, storage_type))
    if not candidates:
        return ([], current_pick_sequence)
    best_priority = min(get_storage_priority(item[2]) or EFFECTIVE_SEQ_UNSEQUENCED for item in candidates)
    candidates = [c for c in candidates if (get_storage_priority(c[2]) or EFFECTIVE_SEQ_UNSEQUENCED) == best_priority]
    candidates.sort(
        key=lambda item: (
            getattr(item[0], "expiry_date", None) or NO_EXPIRY_SENTINEL,
            _effective_pick_sequence(item[1]),
            item[0].location_id,
            item[0].id,
        )
    )
    remaining = float(need)
    slices: list[tuple[Inventory, float]] = []
    next_seq_out = current_pick_sequence
    for row, pick_sequence, _storage_type in candidates:
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
        if pick_sequence is not None:
            next_seq_out = pick_sequence
    return (slices, next_seq_out)


def required_disposition_for_order_item(db: Session, order_item_id: int | None) -> str:
    if order_item_id is None:
        return DEFAULT_STOCK_DISPOSITION
    from ..models.order_item import OrderItem

    oi = db.query(OrderItem).filter(OrderItem.id == int(order_item_id)).first()
    return resolve_order_item_required_disposition(oi)
