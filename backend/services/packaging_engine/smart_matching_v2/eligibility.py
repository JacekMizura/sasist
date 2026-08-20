"""Eligibility for Smart Matching v2 learning / suggestion."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ....models.order import Order
from ....models.order_item import OrderItem


@dataclass(frozen=True)
class V2EligibleLine:
    product_id: int
    quantity: int


def single_product_qty_from_order(db: Session, order: Order) -> Optional[V2EligibleLine]:
    """
    v2 applies only to orders with exactly one distinct product_id
    (variant = own product_id; set = set product_id, no BOM explode).

    Multiple OrderItem rows for the same product_id are aggregated by qty.
    Multi-SKU baskets return None (no v2 learning / no fake basket key).
    """
    items = db.query(OrderItem).filter(OrderItem.order_id == int(order.id)).all()
    by_pid: dict[int, int] = {}
    for it in items:
        pid = int(getattr(it, "product_id", 0) or 0)
        qty = int(getattr(it, "quantity", 0) or 0)
        if pid <= 0 or qty <= 0:
            continue
        by_pid[pid] = by_pid.get(pid, 0) + qty
    if len(by_pid) != 1:
        return None
    pid, qty = next(iter(by_pid.items()))
    return V2EligibleLine(product_id=pid, quantity=qty)
