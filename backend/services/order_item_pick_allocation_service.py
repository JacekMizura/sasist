"""Persist and read order-line pick allocations (lot traceability)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.order_item_pick_allocation import OrderItemPickAllocation
from ..models.pick import Pick

SENTINEL_EXPIRY = date(9999, 12, 31)


@dataclass(frozen=True)
class PickLotSlice:
    quantity: float
    batch_number: str
    expiry_date: date
    inventory_id: Optional[int] = None
    warehouse_carrier_id: Optional[int] = None


def lot_key_from_inventory(inv) -> tuple[str, date]:
    batch = (getattr(inv, "batch_number", None) or "").strip()
    exp = getattr(inv, "expiry_date", None) or SENTINEL_EXPIRY
    return batch, exp


def consume_inventory_fifo_slices(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    quantity: float,
) -> list[PickLotSlice]:
    """FIFO by expiry then id — returns slices actually consumed."""
    from ..models.inventory import Inventory

    qty = float(quantity or 0)
    if qty <= 1e-12:
        return []
    rows = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.quantity > 0,
        )
        .order_by(Inventory.expiry_date.asc(), Inventory.id.asc())
        .with_for_update()
        .all()
    )
    total_avail = sum(float(r.quantity or 0) for r in rows)
    if total_avail + 1e-9 < qty:
        raise ValueError(
            f"Brak stanu w lokalizacji dla produktu #{product_id}: wymagane {qty}, dostępne {round(total_avail, 4)}."
        )
    remaining = qty
    slices: list[PickLotSlice] = []
    for inv in rows:
        if remaining <= 1e-12:
            break
        cur = float(inv.quantity or 0)
        if cur <= 1e-12:
            continue
        take = min(cur, remaining)
        inv.quantity = cur - take
        remaining -= take
        batch, exp = lot_key_from_inventory(inv)
        carrier_id = getattr(inv, "carrier_id", None)
        slices.append(
            PickLotSlice(
                quantity=float(take),
                batch_number=batch,
                expiry_date=exp,
                inventory_id=int(inv.id) if getattr(inv, "id", None) is not None else None,
                warehouse_carrier_id=int(carrier_id) if carrier_id is not None else None,
            )
        )
    return slices


def persist_pick_allocation(
    db: Session,
    pick: Pick,
    slice_: PickLotSlice,
    *,
    picked_at: datetime,
    picked_by: int | None,
) -> OrderItemPickAllocation:
    if pick.order_item_id is None:
        raise ValueError("Pick bez order_item_id — brak alokacji")
    row = OrderItemPickAllocation(
        tenant_id=int(pick.tenant_id),
        warehouse_id=int(pick.warehouse_id or 0),
        order_id=int(pick.order_id),
        order_item_id=int(pick.order_item_id),
        product_id=int(pick.product_id),
        pick_id=int(pick.id),
        location_id=int(pick.location_id),
        batch_number=slice_.batch_number,
        expiry_date=slice_.expiry_date,
        serial_number="",
        warehouse_carrier_id=slice_.warehouse_carrier_id,
        quantity=float(slice_.quantity),
        picked_by=int(picked_by) if picked_by is not None and int(picked_by) > 0 else None,
        picked_at=picked_at,
    )
    db.add(row)
    return row


def list_allocations_for_order_item(db: Session, order_item_id: int) -> list[OrderItemPickAllocation]:
    return (
        db.query(OrderItemPickAllocation)
        .filter(OrderItemPickAllocation.order_item_id == int(order_item_id))
        .order_by(OrderItemPickAllocation.picked_at.asc(), OrderItemPickAllocation.id.asc())
        .all()
    )


def _location_label(db: Session, location_id: int) -> str:
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        return f"#{location_id}"
    return (loc.name or "").strip() or f"#{location_id}"


def allocation_breakdown_for_order_line(
    db: Session,
    order_item_id: int,
) -> list[tuple[str, float, str, date | None]]:
    """
    Returns rows: (location_label, quantity, batch_number, expiry_date).
    expiry_date is None when sentinel / empty lot.
    """
    rows = list_allocations_for_order_item(db, order_item_id)
    if not rows:
        return []
    out: list[tuple[str, float, str, date | None]] = []
    for a in rows:
        lbl = _location_label(db, int(a.location_id))
        batch = (a.batch_number or "").strip()
        exp: date | None = a.expiry_date
        if exp is not None and exp >= SENTINEL_EXPIRY:
            exp = None
        out.append((lbl, float(a.quantity or 0), batch, exp))
    return out


def log_pick_allocation_debug(
    *,
    order_id: int,
    product_id: int,
    location_label: str,
    batch: str,
    expiry: date | None,
    quantity: float,
) -> None:
    import logging

    logging.getLogger(__name__).info(
        "[PICK ALLOCATION] %s",
        {
            "orderId": int(order_id),
            "productId": int(product_id),
            "location": location_label,
            "batch": batch or None,
            "expiry": expiry.isoformat() if expiry is not None else None,
            "quantity": float(quantity),
        },
    )
