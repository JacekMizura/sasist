"""Undo draft picks for cartless session (Pick.cart_id IS NULL)."""

from __future__ import annotations

import logging
from typing import Sequence

from sqlalchemy.orm import Session

from ...models.pick import Pick
from ..fulfillment_event_service import delete_pick_events_for_pick_ids
from ..order_fulfillment_recompute import recompute_order_fulfillment

logger = logging.getLogger(__name__)


def undo_cartless_session_picks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    location_id: int | None = None,
    order_ids: Sequence[int] | None = None,
    order_item_id: int | None = None,
    operator_user_id: int | None = None,
) -> dict:
    """Cofa draft Pick z cart_id IS NULL — bez WarehouseCart."""
    _ = operator_user_id
    qty = float(quantity or 0)
    if qty <= 1e-9:
        return {"ok": True, "undone_qty": 0.0, "deleted_pick_ids": []}

    q = (
        db.query(Pick)
        .filter(
            Pick.tenant_id == int(tenant_id),
            Pick.warehouse_id == int(warehouse_id),
            Pick.product_id == int(product_id),
            Pick.cart_id.is_(None),
            Pick.picked_at.is_(None),
            Pick.status.in_(("picking", "waiting")),
        )
        .order_by(Pick.id.desc())
    )
    if location_id is not None:
        q = q.filter(Pick.location_id == int(location_id))
    if order_ids:
        q = q.filter(Pick.order_id.in_([int(x) for x in order_ids]))
    if order_item_id is not None:
        q = q.filter(Pick.order_item_id == int(order_item_id))

    picks = q.all()
    remaining = qty
    deleted_ids: list[int] = []
    touched_orders: set[int] = set()

    for p in picks:
        if remaining <= 1e-9:
            break
        pq = float(p.quantity or 0)
        if pq <= 1e-9:
            continue
        take = min(pq, remaining)
        if take + 1e-9 >= pq:
            deleted_ids.append(int(p.id))
            touched_orders.add(int(p.order_id))
            db.delete(p)
            remaining -= pq
        else:
            p.quantity = round(pq - take, 6)
            db.add(p)
            touched_orders.add(int(p.order_id))
            remaining -= take

    if deleted_ids:
        delete_pick_events_for_pick_ids(db, deleted_ids)
    for oid in touched_orders:
        recompute_order_fulfillment(db, int(oid), commit=False, session_cart_id=None)

    return {
        "ok": True,
        "undone_qty": round(qty - remaining, 6),
        "deleted_pick_ids": deleted_ids,
        "order_ids": sorted(touched_orders),
    }
