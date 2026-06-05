"""Pickface intelligence — heat metrics from recent sales velocity (foundation)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_item import OrderItem

logger = logging.getLogger(__name__)


def product_heat_scores(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    days: int = 14,
    limit: int = 50,
) -> list[dict]:
    """Rank products by fulfilled quantity in recent orders (warehouse-scoped proxy)."""
    since = datetime.utcnow() - timedelta(days=int(days))
    rows = (
        db.query(
            OrderItem.product_id,
            func.sum(OrderItem.quantity).label("qty"),
        )
        .join(Order, Order.id == OrderItem.order_id)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.created_at >= since,
            OrderItem.product_id.isnot(None),
        )
        .group_by(OrderItem.product_id)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(int(limit))
        .all()
    )
    out = [{"product_id": int(r[0]), "heat_qty": float(r[1] or 0)} for r in rows if r[0]]
    logger.info(
        "[pickface.intelligence] heat tenant_id=%s warehouse_id=%s rows=%s",
        tenant_id,
        warehouse_id,
        len(out),
    )
    return out
