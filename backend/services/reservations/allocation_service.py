"""Strategy-based inventory slice allocation for reservations."""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .availability_service import iter_allocatable_inventory_rows


@dataclass(frozen=True)
class AllocationSlice:
    location_id: int
    quantity: float
    batch_number: str
    expiry_date: date
    inventory_id: int | None
    serial_number: str | None = None


def _row_sort_key(strategy: str):
    strat = (strategy or "FEFO").upper()

    def key(item: tuple[Inventory, float]):
        inv, _ = item
        if strat == "LIFO":
            return (getattr(inv, "expiry_date", NO_EXPIRY_SENTINEL), -int(inv.id))
        if strat == "FIFO":
            return (int(inv.id),)
        return (getattr(inv, "expiry_date", NO_EXPIRY_SENTINEL), int(inv.id))

    return key


def _location_group_sort_key(strategy: str):
    row_key = _row_sort_key(strategy)
    strat = (strategy or "FEFO").upper()

    def key(group: tuple[int, list[tuple[Inventory, float]]]):
        _lid, rows = group
        best = sorted(rows, key=row_key)[0][0]
        if strat == "LIFO":
            return (getattr(best, "expiry_date", NO_EXPIRY_SENTINEL), -int(best.id))
        if strat == "FIFO":
            return (min(int(r[0].id) for r in rows),)
        return (getattr(best, "expiry_date", NO_EXPIRY_SENTINEL), min(int(r[0].id) for r in rows))

    return key


def allocate_product_quantity(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    strategy: str = "FEFO",
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
    allow_sales_locations: bool = False,
) -> list[AllocationSlice]:
    """Greedy location-first allocation — minimize number of bins touched."""
    need = float(quantity or 0)
    if need <= 1e-9:
        return []

    strat = (strategy or "FEFO").upper()
    row_key = _row_sort_key(strat)
    loc_key = _location_group_sort_key(strat)

    by_loc: dict[int, list[tuple[Inventory, float]]] = defaultdict(list)
    for inv, net in iter_allocatable_inventory_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        strategy=strat,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
        allow_sales_locations=allow_sales_locations,
    ):
        by_loc[int(inv.location_id)].append((inv, net))

    loc_groups = [(lid, sorted(rows, key=row_key)) for lid, rows in by_loc.items()]
    loc_groups.sort(key=loc_key, reverse=(strat == "LIFO"))

    slices: list[AllocationSlice] = []
    remaining = need
    for _lid, loc_rows in loc_groups:
        if remaining <= 1e-9:
            break
        loc_total = sum(n for _, n in loc_rows)
        take_from_loc = min(loc_total, remaining)
        if take_from_loc <= 1e-9:
            continue
        need_from_loc = take_from_loc
        for inv, net in loc_rows:
            if need_from_loc <= 1e-9:
                break
            take = min(net, need_from_loc)
            bn = normalize_batch_number(getattr(inv, "batch_number", None))
            ed = getattr(inv, "expiry_date", None) or NO_EXPIRY_SENTINEL
            slices.append(
                AllocationSlice(
                    location_id=int(inv.location_id),
                    quantity=round(take, 4),
                    batch_number=bn,
                    expiry_date=ed,
                    inventory_id=int(inv.id) if inv.id else None,
                )
            )
            need_from_loc -= take
        remaining -= take_from_loc

    if remaining > 1e-6:
        raise ValueError(
            f"Brak dostępnego stanu dla produktu #{product_id}: brakuje {round(remaining, 4)}."
        )
    return slices
