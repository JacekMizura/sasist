"""Sanity checks for ``orders.shipping_method_id`` — orphaned FK breaks order UPDATE."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any, Optional

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


def assert_shipping_method_fk_assignable(
    db: "Session",
    shipping_method_id: Optional[str],
    *,
    tenant_id: Optional[int] = None,
    warehouse_id: Optional[int] = None,
) -> Optional[str]:
    """
    Invariant for write-paths: ``shipping_method_id`` must be NULL or an existing
    ``shipping_methods.id`` (optionally scoped to tenant/warehouse).

    Returns normalized id or None. Raises ``ValueError`` on orphan / scope mismatch.
    """
    if shipping_method_id is None:
        return None
    sid = str(shipping_method_id).strip()
    if not sid:
        return None
    q = db.query(ShippingMethod).filter(ShippingMethod.id == sid)
    if tenant_id is not None:
        q = q.filter(ShippingMethod.tenant_id == int(tenant_id))
    if warehouse_id is not None:
        q = q.filter(ShippingMethod.warehouse_id == int(warehouse_id))
    row = q.first()
    if row is None:
        raise ValueError(
            f"shipping_method_id={sid!r} does not exist in shipping_methods"
            + (f" for tenant={tenant_id} warehouse={warehouse_id}" if tenant_id is not None else "")
        )
    return str(row.id)


def sanitize_order_orphan_shipping_method_id(db: "Session", order: "Order") -> bool:
    """
    Clear ``order.shipping_method_id`` when it points at a missing ``shipping_methods`` row.

    Keeps free-text ``order.shipping_method`` label when present (display / remapping later).
    Returns True when the order was modified.
    """
    sid = getattr(order, "shipping_method_id", None)
    if sid is None or not str(sid).strip():
        return False
    sid_s = str(sid).strip()
    if shipping_method_id_exists(db, sid_s):
        return False
    logger.warning(
        "[order.shipping] orphan shipping_method_id=%s order_id=%s number=%s "
        "tenant_id=%s warehouse_id=%s source=%s -> NULL (label kept=%r)",
        sid_s,
        getattr(order, "id", None),
        getattr(order, "number", None),
        getattr(order, "tenant_id", None),
        getattr(order, "warehouse_id", None),
        getattr(order, "source", None),
        getattr(order, "shipping_method", None),
    )
    order.shipping_method_id = None
    return True


def audit_orphan_order_shipping_method_ids(
    db: "Session",
    *,
    order_ids: Optional[list[int]] = None,
    limit: int = 500,
) -> dict[str, Any]:
    """
    Read-only audit: orders whose ``shipping_method_id`` does not exist in ``shipping_methods``.

    Returns ``{total, rows: [{order_id, order_number, tenant_id, warehouse_id,
    shipping_method_id, shipping_method_label, source, created_at}, ...]}``.
    """
    from ..models.order import Order

    q = (
        db.query(Order)
        .filter(Order.shipping_method_id.isnot(None))
        .filter(Order.shipping_method_id != "")
    )
    if order_ids:
        q = q.filter(Order.id.in_([int(x) for x in order_ids]))
    candidates = q.limit(max(1, int(limit))).all()
    rows: list[dict[str, Any]] = []
    for o in candidates:
        sid = str(getattr(o, "shipping_method_id", None) or "").strip()
        if not sid:
            continue
        if shipping_method_id_exists(db, sid):
            continue
        rows.append(
            {
                "order_id": int(o.id),
                "order_number": str(getattr(o, "number", None) or ""),
                "tenant_id": int(o.tenant_id) if getattr(o, "tenant_id", None) is not None else None,
                "warehouse_id": int(o.warehouse_id) if getattr(o, "warehouse_id", None) is not None else None,
                "shipping_method_id": sid,
                "shipping_method_label": getattr(o, "shipping_method", None),
                "source": getattr(o, "source", None),
                "created_at": getattr(o, "created_at", None),
            }
        )
    return {"total": len(rows), "rows": rows}


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
