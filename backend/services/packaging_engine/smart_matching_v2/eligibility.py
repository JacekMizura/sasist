"""Eligibility helpers — prefer composition.pattern_from_order for full v2."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy.orm import Session

from ....models.order import Order
from .composition import pattern_from_order
from .constants import PATTERN_SINGLE


@dataclass(frozen=True)
class V2EligibleLine:
    product_id: int
    quantity: int


def single_product_qty_from_order(db: Session, order: Order) -> Optional[V2EligibleLine]:
    """
    SINGLE_PRODUCT only. Multi-SKU returns None.

    Prefer pattern_from_order() for Observation / learning that handles both types.
    Kept for tests and SINGLE-only call sites.
    """
    snap = pattern_from_order(db, order)
    if snap is None or snap.pattern_type != PATTERN_SINGLE:
        return None
    return V2EligibleLine(product_id=int(snap.anchor_product_id), quantity=int(snap.quantity))
