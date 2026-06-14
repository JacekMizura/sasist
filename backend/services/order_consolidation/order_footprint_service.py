"""P5.8C — order volume aggregation via existing ProductFootprint (slotting SSOT)."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session

from ...models.order import Order
from ...models.order_consolidation_plan import OrderConsolidationPlan, OrderConsolidationPlanItem
from ...models.order_item import OrderItem
from ..bundle_order_item_ops import order_item_is_operational_picking_line
from ...models.product import Product
from ..slotting.capacity_service import product_footprint_from_orm
from .constants import ITEM_STATUS_CANCELLED

# 1 cm × 1 cm × 1 cm per unit when product lacks dimensions (0.001 dm³).
ESTIMATED_UNIT_VOLUME_DM3 = 0.001


@dataclass(frozen=True)
class OrderFootprintResult:
    volume_dm3: float
    dimension_estimated: bool
    estimated_items_count: int
    total_items_count: int
    has_real_dimensions: bool


def _product_has_real_dimensions(product: Product) -> bool:
    if product.volume is not None and float(product.volume) > 0:
        return True
    length = float(product.length or 0)
    width = float(product.width or 0)
    height = float(product.height or 0)
    return length > 0 and width > 0 and height > 0


def _unit_volume_dm3(product: Product) -> tuple[float, bool]:
    if _product_has_real_dimensions(product):
        footprint = product_footprint_from_orm(product)
        return max(float(footprint.volume_dm3), ESTIMATED_UNIT_VOLUME_DM3), False
    return ESTIMATED_UNIT_VOLUME_DM3, True


def _aggregate_lines(
    lines: list[tuple[Product | None, float]],
) -> OrderFootprintResult:
    total_vol = 0.0
    estimated_units = 0
    total_units = 0
    has_real = False

    for product, qty in lines:
        q = max(0.0, float(qty or 0))
        if q <= 0:
            continue
        total_units += int(q) if q == int(q) else 1
        if product is None:
            total_vol += ESTIMATED_UNIT_VOLUME_DM3 * q
            estimated_units += int(q) if q == int(q) else 1
            continue
        unit_vol, estimated = _unit_volume_dm3(product)
        total_vol += unit_vol * q
        if estimated:
            estimated_units += int(q) if q == int(q) else 1
        else:
            has_real = True

    return OrderFootprintResult(
        volume_dm3=round(total_vol, 4),
        dimension_estimated=estimated_units > 0,
        estimated_items_count=int(estimated_units),
        total_items_count=int(total_units),
        has_real_dimensions=has_real,
    )


def calculate_order_footprint(db: Session, order_id: int) -> OrderFootprintResult:
    """Sum line volumes for consolidation allocation (plan items preferred)."""
    plan = (
        db.query(OrderConsolidationPlan)
        .filter(OrderConsolidationPlan.order_id == int(order_id))
        .order_by(OrderConsolidationPlan.id.desc())
        .first()
    )
    if plan is not None:
        rows = (
            db.query(OrderConsolidationPlanItem, Product)
            .outerjoin(Product, Product.id == OrderConsolidationPlanItem.product_id)
            .filter(OrderConsolidationPlanItem.plan_id == int(plan.id))
            .all()
        )
        lines: list[tuple[Product | None, float]] = []
        for item, product in rows:
            if str(item.status).upper() == ITEM_STATUS_CANCELLED:
                continue
            lines.append((product, float(item.quantity or 0)))
        if lines:
            return _aggregate_lines(lines)

    order = db.query(Order).filter(Order.id == int(order_id)).first()
    if order is None:
        return OrderFootprintResult(0.0, False, 0, 0, False)

    rows = (
        db.query(OrderItem, Product)
        .outerjoin(Product, Product.id == OrderItem.product_id)
        .filter(OrderItem.order_id == int(order_id))
        .all()
    )
    lines = [
        (product, float(it.quantity or 0))
        for it, product in rows
        if order_item_is_operational_picking_line(it)
    ]
    return _aggregate_lines(lines)
