"""Lot-level inventory hints for material shortage analysis."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL
from ..reservations.availability_service import (
    iter_allocatable_inventory_rows,
    production_allocatable_qty,
    warehouse_on_hand,
)


def _format_expiry(ed) -> str | None:
    if ed is None or ed == NO_EXPIRY_SENTINEL:
        return None
    if isinstance(ed, date):
        return ed.isoformat()
    return str(ed)[:10]


def inventory_lot_hints(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
    limit: int = 12,
    strategy: str = "FEFO",
    allow_sales_locations: bool = False,
) -> list[dict[str, Any]]:
    """Per lot/location rows with on-hand, reserved, net available."""
    loc_cache: dict[int, str] = {}
    rows: list[dict[str, Any]] = []
    for inv, net in iter_allocatable_inventory_rows(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        strategy=strategy,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
        allow_sales_locations=bool(allow_sales_locations),
    ):
        lid = int(inv.location_id)
        if lid not in loc_cache:
            loc = db.query(Location).filter(Location.id == lid).first()
            loc_cache[lid] = str(getattr(loc, "code", None) or getattr(loc, "name", None) or f"#{lid}")
        on_hand = float(inv.quantity or 0)
        reserved = max(0.0, on_hand - net)
        bn = str(getattr(inv, "batch_number", None) or "").strip() or None
        ed = _format_expiry(getattr(inv, "expiry_date", None))
        rows.append(
            {
                "location_id": lid,
                "location_code": loc_cache[lid],
                "batch_number": bn,
                "lot": bn,
                "expiry_date": ed,
                "on_hand_qty": round(on_hand, 4),
                "reserved_qty": round(reserved, 4),
                "available_qty": round(net, 4),
            }
        )
        if len(rows) >= limit:
            break
    return rows


def component_stock_breakdown(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    exclude_batch_id: int | None = None,
    exclude_order_id: int | None = None,
    allow_sales_locations: bool = False,
) -> dict[str, float]:
    """
    Production material stock view.

    ``available_qty`` is production-allocatable net (same SSOT as
    ``allocate_product_quantity``) — DOCK is excluded when putaway is required.
    ``on_hand_qty`` remains physical warehouse on-hand for context.
    """
    on_hand = warehouse_on_hand(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id)
    available = production_allocatable_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
        allow_sales_locations=bool(allow_sales_locations),
    )
    # Foreign holds / ineligible stock that sit on physical on-hand but are not allocatable.
    reserved = max(0.0, round(float(on_hand) - float(available), 4))
    return {
        "on_hand_qty": round(on_hand, 4),
        "reserved_qty": reserved,
        "available_qty": round(available, 4),
    }
