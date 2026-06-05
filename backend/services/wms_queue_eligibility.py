"""Central WMS queue eligibility — IMMEDIATE / PICKUP / etc. never enter pick/pack queues."""

from __future__ import annotations

from sqlalchemy import func, or_

from ..models.order import Order
from ..schemas.commerce_enums import DEFAULT_FULFILLMENT_MODE, WMS_ELIGIBLE_FULFILLMENT_MODES


def normalize_fulfillment_mode(raw: object | None) -> str:
    s = (str(raw).strip().upper() if raw is not None else "") or DEFAULT_FULFILLMENT_MODE
    return s if s in WMS_ELIGIBLE_FULFILLMENT_MODES or s else DEFAULT_FULFILLMENT_MODE


def order_eligible_for_wms_queues(order: Order) -> bool:
    mode = (getattr(order, "fulfillment_mode", None) or "").strip().upper()
    if not mode:
        return True
    return mode in WMS_ELIGIBLE_FULFILLMENT_MODES


def wms_queue_fulfillment_mode_clauses():
    """SQLAlchemy filters: only orders with fulfillment_mode NULL or WMS."""
    return (
        or_(
            Order.fulfillment_mode.is_(None),
            func.trim(Order.fulfillment_mode) == "",
            func.upper(func.trim(Order.fulfillment_mode)) == "WMS",
        ),
    )
