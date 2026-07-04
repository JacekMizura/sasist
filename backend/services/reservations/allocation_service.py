"""Strategy-based inventory slice allocation for reservations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

from sqlalchemy.orm import Session

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
) -> list[AllocationSlice]:
    need = float(quantity or 0)
    if need <= 1e-9:
        return []
    slices: list[AllocationSlice] = []
    remaining = need
    for inv, net in iter_allocatable_inventory_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        strategy=strategy,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
    ):
        if remaining <= 1e-9:
            break
        take = min(net, remaining)
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
        remaining -= take
    if remaining > 1e-6:
        raise ValueError(
            f"Brak dostępnego stanu dla produktu #{product_id}: brakuje {round(remaining, 4)}."
        )
    return slices
