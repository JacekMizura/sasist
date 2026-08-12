"""ProductionOrder ↔ OrderItem demand links (order-driven MO foundation)."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.production import (
    PRODUCTION_ORDER_SOURCE_ITEM_OPEN,
    PRODUCTION_ORDER_SOURCE_ORDERS,
    ProductionOrder,
    ProductionOrderSourceItem,
)


class ProductionOrderSourceError(Exception):
    def __init__(self, message: str, *, code: str = "source_error") -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def attach_order_source_item(
    db: Session,
    *,
    tenant_id: int,
    production_order: ProductionOrder,
    order_item_id: int,
    requested_quantity: float,
    fulfilled_quantity: float = 0.0,
    status: str = PRODUCTION_ORDER_SOURCE_ITEM_OPEN,
) -> ProductionOrderSourceItem:
    """
    Link an OrderItem to an MO. Does not mutate order status / MO lifecycle.

    Enforces uniqueness (tenant, production_order_id, order_item_id).
    """
    qty = float(requested_quantity)
    if qty <= 0:
        raise ProductionOrderSourceError("requested_quantity must be > 0.", code="invalid_quantity")

    item = (
        db.query(OrderItem)
        .filter(OrderItem.id == int(order_item_id))
        .first()
    )
    if item is None:
        raise ProductionOrderSourceError("Pozycja zamówienia nie istnieje.", code="order_item_not_found")

    order = db.query(Order).filter(Order.id == int(item.order_id)).first()
    if order is None or int(order.tenant_id) != int(tenant_id):
        raise ProductionOrderSourceError("Zamówienie nie należy do tenanta.", code="order_tenant_mismatch")

    if int(production_order.tenant_id) != int(tenant_id):
        raise ProductionOrderSourceError("Zlecenie produkcyjne nie należy do tenanta.", code="mo_tenant_mismatch")

    if str(getattr(production_order, "source_type", "") or "") != PRODUCTION_ORDER_SOURCE_ORDERS:
        production_order.source_type = PRODUCTION_ORDER_SOURCE_ORDERS

    existing = (
        db.query(ProductionOrderSourceItem)
        .filter(
            ProductionOrderSourceItem.tenant_id == int(tenant_id),
            ProductionOrderSourceItem.production_order_id == int(production_order.id),
            ProductionOrderSourceItem.order_item_id == int(order_item_id),
        )
        .first()
    )
    if existing is not None:
        raise ProductionOrderSourceError(
            "Ta pozycja zamówienia jest już powiązana z tym zleceniem produkcyjnym.",
            code="duplicate_source",
        )

    row = ProductionOrderSourceItem(
        tenant_id=int(tenant_id),
        production_order_id=int(production_order.id),
        order_id=int(item.order_id),
        order_item_id=int(order_item_id),
        product_id=int(item.product_id),
        requested_quantity=qty,
        fulfilled_quantity=float(fulfilled_quantity or 0),
        status=str(status or PRODUCTION_ORDER_SOURCE_ITEM_OPEN),
    )
    db.add(row)
    try:
        db.flush()
    except IntegrityError as exc:
        raise ProductionOrderSourceError(
            "Ta pozycja zamówienia jest już powiązana z tym zleceniem produkcyjnym.",
            code="duplicate_source",
        ) from exc
    return row


def aggregate_order_source_quantities(
    sources: list[ProductionOrderSourceItem] | None,
) -> tuple[int, float, float]:
    """Returns (distinct_order_count, requested_total, fulfilled_total)."""
    rows = list(sources or [])
    order_ids = {int(r.order_id) for r in rows}
    requested = sum(float(r.requested_quantity or 0) for r in rows)
    fulfilled = sum(float(r.fulfilled_quantity or 0) for r in rows)
    return len(order_ids), requested, fulfilled
