"""Lot-level inventory hints for material shortage analysis."""

from __future__ import annotations

from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from ...models.location import Location
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL
from ..reservations.availability_service import iter_allocatable_inventory_rows, warehouse_net_available, warehouse_on_hand, warehouse_reserved_qty


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
) -> dict[str, float]:
    on_hand = warehouse_on_hand(db, tenant_id=tenant_id, warehouse_id=warehouse_id, product_id=product_id)
    reserved = warehouse_reserved_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
    )
    net = warehouse_net_available(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        exclude_batch_id=exclude_batch_id,
        exclude_order_id=exclude_order_id,
    )
    return {
        "on_hand_qty": round(on_hand, 4),
        "reserved_qty": round(reserved, 4),
        "available_qty": round(net, 4),
    }
