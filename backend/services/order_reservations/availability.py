"""Warehouse-level business ATP (physical − order_warehouse_reservations)."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.order_warehouse_reservation import OrderWarehouseReservation
from ..stock_disposition import DEFAULT_STOCK_DISPOSITION, normalize_stock_disposition
from .constants import OWR_ACTIVE_STATUSES


def warehouse_physical_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
) -> float:
    sd = normalize_stock_disposition(stock_disposition)
    row = (
        db.query(func.coalesce(func.sum(Inventory.quantity), 0.0))
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.stock_disposition == sd,
            Inventory.quantity > 0,
        )
        .scalar()
    )
    return float(row or 0)


def warehouse_business_reserved_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    exclude_order_id: int | None = None,
) -> float:
    """Sum of remaining qty on active business reservations (optional exclude own order)."""
    sd = normalize_stock_disposition(stock_disposition)
    q = db.query(func.coalesce(func.sum(OrderWarehouseReservation.quantity), 0.0)).filter(
        OrderWarehouseReservation.tenant_id == int(tenant_id),
        OrderWarehouseReservation.warehouse_id == int(warehouse_id),
        OrderWarehouseReservation.product_id == int(product_id),
        OrderWarehouseReservation.status.in_(tuple(OWR_ACTIVE_STATUSES)),
        OrderWarehouseReservation.stock_disposition == sd,
        OrderWarehouseReservation.quantity > 0,
    )
    if exclude_order_id is not None:
        q = q.filter(OrderWarehouseReservation.order_id != int(exclude_order_id))
    return float(q.scalar() or 0)


def warehouse_business_available_qty(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    stock_disposition: str = DEFAULT_STOCK_DISPOSITION,
    exclude_order_id: int | None = None,
) -> float:
    """AVAILABLE FOR SALE = physical − business reserved (foreign when exclude set)."""
    physical = warehouse_physical_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        stock_disposition=stock_disposition,
    )
    reserved = warehouse_business_reserved_qty(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_id=product_id,
        stock_disposition=stock_disposition,
        exclude_order_id=exclude_order_id,
    )
    return max(0.0, round(physical - reserved, 6))
