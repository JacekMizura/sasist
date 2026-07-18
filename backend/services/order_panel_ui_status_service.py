"""
Zmiana statusu panelu zamówienia — bez bezpośredniego czyszczenia cart_id.

Jeżeli zamówienie jest na wózku, odłączenie idzie wyłącznie przez CartLifecycle.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.cart import Cart
from ..models.order import Order
from .cart_picking_lifecycle_service import (
    CartLifecycleError,
    can_detach_order_from_cart,
    detach_order_from_cart,
)

logger = logging.getLogger(__name__)


def apply_order_panel_ui_status(
    db: Session,
    *,
    order: Order,
    sub_status_id: Optional[int],
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Ustawia ``order_ui_status_id``.

    Semantyka historyczna: zmiana statusu panelu = opuszczenie kontekstu zbierania,
    więc jeśli ``order.cart_id`` jest ustawione — kanoniczny detach.
    Bez ``cart_id`` — tylko status, bez lifecycle eventów.
    """
    order.order_ui_status_id = int(sub_status_id) if sub_status_id is not None else None

    cart_id = getattr(order, "cart_id", None)
    if cart_id is None or int(cart_id) <= 0:
        db.add(order)
        return {"status_updated": True, "detached": False}

    tid = int(order.tenant_id)
    wid = int(order.warehouse_id)
    cid = int(cart_id)

    cart = (
        db.query(Cart)
        .filter(
            Cart.id == cid,
            Cart.tenant_id == tid,
            Cart.warehouse_id == wid,
        )
        .first()
    )
    if cart is None:
        # Orphan pointer (wózek usunięty) — heal; nie ma CartLifecycle do wywołania.
        from .order_fulfillment_state import clear_order_picking_session_context

        logger.warning(
            "[panel.ui_status] orphan cart_id=%s on order_id=%s — heal fields only",
            cid,
            int(order.id),
        )
        clear_order_picking_session_context(order)
        db.add(order)
        return {"status_updated": True, "detached": False, "healed_orphan_cart": True}

    allowed, block_reason = can_detach_order_from_cart(db, cart=cart, order=order)
    if not allowed:
        raise CartLifecycleError(
            block_reason
            or "Nie można odłączyć zamówienia od wózka (trwa zbieranie / są picki).",
            code="OrderDetachBlocked",
        )

    detach_order_from_cart(
        db,
        cart_id=cid,
        order_id=int(order.id),
        tenant_id=tid,
        warehouse_id=wid,
        operator_user_id=operator_user_id,
        reason="Odłączenie po zmianie statusu panelu zamówienia.",
    )
    return {"status_updated": True, "detached": True, "cart_id": cid}
