"""Read-only audit: aktywne wózki z zamówieniami, które FAIL-nęłyby Walidację WMS."""

from __future__ import annotations

import logging
from collections import Counter
from typing import Any

from sqlalchemy.orm import Session

from ...models.cart import Cart
from ...models.enums import CartStatus
from ...models.order import Order
from .service import validate_orders_for_picking

logger = logging.getLogger(__name__)


def audit_active_cart_orders_validation_failures(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
) -> dict[str, Any]:
    """
    Nie mutuje danych. Zwraca liczbę i breakdown reason_code.
    """
    carts = (
        db.query(Cart)
        .filter(
            Cart.tenant_id == int(tenant_id),
            Cart.warehouse_id == int(warehouse_id),
            Cart.status.in_([CartStatus.PICKING.value, CartStatus.ASSIGNED.value, "PICKING", "ASSIGNED"]),
        )
        .all()
    )
    cart_ids = [int(c.id) for c in carts]
    if not cart_ids:
        return {
            "active_carts": 0,
            "orders_on_carts": 0,
            "would_fail": 0,
            "reason_breakdown": {},
            "sample_order_ids": [],
        }

    orders = (
        db.query(Order)
        .filter(
            Order.tenant_id == int(tenant_id),
            Order.warehouse_id == int(warehouse_id),
            Order.cart_id.in_(cart_ids),
            Order.deleted_at.is_(None),
        )
        .all()
    )
    if not orders:
        return {
            "active_carts": len(cart_ids),
            "orders_on_carts": 0,
            "would_fail": 0,
            "reason_breakdown": {},
            "sample_order_ids": [],
        }

    results = validate_orders_for_picking(
        db,
        order_ids=[int(o.id) for o in orders],
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
    )
    reasons: Counter[str] = Counter()
    fail_ids: list[int] = []
    for r in results:
        if r.ok:
            continue
        fail_ids.append(int(r.order_id))
        for iss in r.issues:
            reasons[str(iss.reason_code)] += 1

    out = {
        "active_carts": len(cart_ids),
        "orders_on_carts": len(orders),
        "would_fail": len(fail_ids),
        "reason_breakdown": dict(reasons),
        "sample_order_ids": fail_ids[:50],
    }
    logger.info("[wms.validation.audit] %s", out)
    return out
