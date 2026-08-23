"""
SALES_ORDER FG bridge — warehouse-level business reservation (no location pins).

Physical ``Inventory.quantity`` unchanged on reserve/release; pick finalize decrements
inventory once and consumes business reservation remaining.
"""

from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from .order_reservations import (
    OrderWarehouseReservationError,
    assert_pick_within_business_reservation,
    consume_order_warehouse_reservation,
    ensure_order_warehouse_reservation,
    release_order_warehouse_reservations,
    reserved_qty_for_order_product as owr_reserved_qty,
    sync_order_warehouse_reservation_to_target,
)
from .order_reservations.availability import warehouse_business_available_qty
from .stock_disposition import DEFAULT_STOCK_DISPOSITION

logger = logging.getLogger(__name__)

# Back-compat alias for gate / tests.
SalesOrderReservationError = OrderWarehouseReservationError


def reserved_qty_for_order_product(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    stock_disposition: str | None = None,
    warehouse_id: int | None = None,
) -> float:
    return owr_reserved_qty(
        db,
        tenant_id=tenant_id,
        order_id=order_id,
        product_id=product_id,
        warehouse_id=warehouse_id,
        stock_disposition=stock_disposition,
    )


def reserve_sales_order_fg(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    order_id: int,
    product_id: int,
    quantity: float,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    created_by_user_id: int | None = None,
) -> list:
    """
    Business reservation only (warehouse + product). Does NOT create location holds.
    Returns a single-element list for call-site compatibility (legacy returned StockReservation rows).
    """
    row = ensure_order_warehouse_reservation(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        order_id=order_id,
        product_id=product_id,
        quantity=quantity,
        stock_disposition=stock_disposition,
        created_by_user_id=created_by_user_id,
    )
    return [row]


def release_sales_order_reservations_for_order(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    reason: str = "order_cancelled",
    performed_by_user_id: int | None = None,
    product_id: int | None = None,
) -> int:
    return release_order_warehouse_reservations(
        db,
        tenant_id=tenant_id,
        order_id=order_id,
        product_id=product_id,
        reason=reason,
        performed_by_user_id=performed_by_user_id,
    )


def partial_release_sales_order_qty(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    release_qty: float,
    warehouse_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    performed_by_user_id: int | None = None,
) -> float:
    wid = warehouse_id
    if wid is None:
        from ..models.order import Order

        order = db.query(Order).filter(Order.id == int(order_id)).first()
        wid = int(order.warehouse_id) if order is not None else 0
    if wid <= 0:
        return 0.0
    current = owr_reserved_qty(
        db,
        tenant_id=tenant_id,
        order_id=order_id,
        product_id=product_id,
        warehouse_id=wid,
        stock_disposition=stock_disposition,
    )
    target = max(0.0, round(current - float(release_qty or 0), 6))
    sync_order_warehouse_reservation_to_target(
        db,
        tenant_id=tenant_id,
        warehouse_id=wid,
        order_id=order_id,
        product_id=product_id,
        target_qty=target,
        stock_disposition=stock_disposition,
        performed_by_user_id=performed_by_user_id,
    )
    return round(max(0.0, current - target), 6)


def sync_sales_order_reservation_to_line_qty(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    target_qty: float,
    warehouse_id: int | None = None,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    performed_by_user_id: int | None = None,
) -> float:
    wid = warehouse_id
    if wid is None:
        from ..models.order import Order

        order = db.query(Order).filter(Order.id == int(order_id)).first()
        wid = int(order.warehouse_id) if order is not None else 0
    if wid <= 0:
        return 0.0
    return sync_order_warehouse_reservation_to_target(
        db,
        tenant_id=tenant_id,
        warehouse_id=wid,
        order_id=order_id,
        product_id=product_id,
        target_qty=target_qty,
        stock_disposition=stock_disposition,
        performed_by_user_id=performed_by_user_id,
    )


def consume_sales_order_reservations_for_pick(
    db: Session,
    *,
    tenant_id: int,
    order_id: int,
    product_id: int,
    location_id: int,
    quantity: float,
    warehouse_id: int | None = None,
) -> float:
    """
    Consume business reservation after physical pick.

    ``location_id`` retained for call-site compatibility; not used for business SSOT.
    """
    del location_id  # location allocation is WMS-only; business claim is warehouse-level
    wid = warehouse_id
    if wid is None:
        from ..models.order import Order

        order = db.query(Order).filter(Order.id == int(order_id)).first()
        wid = int(order.warehouse_id) if order is not None else 0
    if wid <= 0:
        return 0.0
    return consume_order_warehouse_reservation(
        db,
        tenant_id=tenant_id,
        warehouse_id=wid,
        order_id=order_id,
        product_id=product_id,
        quantity=quantity,
    )


def sales_order_free_capacity_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> float:
    """AVAILABLE FOR SALE — ignores location holds (anti double-count)."""
    return warehouse_business_available_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        stock_disposition=stock_disposition,
    )


__all__ = [
    "SalesOrderReservationError",
    "assert_pick_within_business_reservation",
    "consume_sales_order_reservations_for_pick",
    "partial_release_sales_order_qty",
    "release_sales_order_reservations_for_order",
    "reserve_sales_order_fg",
    "reserved_qty_for_order_product",
    "sales_order_free_capacity_qty",
    "sync_sales_order_reservation_to_line_qty",
]
