"""Sanity checks for ``orders.shipping_method_id`` — orphaned FK breaks order UPDATE."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine

from ..models.shipping_method import ShippingMethod

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from ..models.order import Order

logger = logging.getLogger(__name__)


def shipping_method_id_exists(db: "Session", shipping_method_id: str) -> bool:
    sid = str(shipping_method_id or "").strip()
    if not sid:
        return False
    return (
        db.query(ShippingMethod.id)
        .filter(ShippingMethod.id == sid)
        .first()
        is not None
    )


def sanitize_order_orphan_shipping_method_id(db: "Session", order: "Order") -> bool:
    """
    Clear ``order.shipping_method_id`` when it points at a missing ``shipping_methods`` row.

    Returns True when the order was modified.
    """
    sid = getattr(order, "shipping_method_id", None)
    if sid is None or not str(sid).strip():
        return False
    sid_s = str(sid).strip()
    if shipping_method_id_exists(db, sid_s):
        return False
    logger.warning(
        "[order.shipping] orphan shipping_method_id=%s order_id=%s -> NULL",
        sid_s,
        getattr(order, "id", None),
    )
    order.shipping_method_id = None
    return True


def clear_orphan_orders_shipping_method_ids(engine: Engine) -> int:
    """One-shot data fix: NULL out orders referencing deleted shipping methods."""
    with engine.connect() as conn:
        result = conn.execute(
            text(
                """
                UPDATE orders
                SET shipping_method_id = NULL
                WHERE shipping_method_id IS NOT NULL
                  AND shipping_method_id NOT IN (SELECT id FROM shipping_methods)
                """
            )
        )
        conn.commit()
        return int(result.rowcount or 0)
