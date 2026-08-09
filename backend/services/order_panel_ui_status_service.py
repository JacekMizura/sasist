"""
Zmiana statusu panelu zamówienia.

Status panelu (`order_ui_status_id`) jest zawsze zapisywany.
Jeśli zamówienie jest na wózku — przy możliwości odłączenia wykonywany jest
kanoniczny detach przez CartLifecycle; gdy detach jest zablokowany (trwa kompletacja /
są picki), status i tak zostaje zapisany (bez odłączania).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from sqlalchemy.orm import Session

from ..models.cart import Cart
from ..models.order import Order
from .cart_picking_lifecycle_service import (
    can_detach_order_from_cart,
    detach_order_from_cart,
)

logger = logging.getLogger(__name__)


def _run_smart_matching_status_hook(
    db: Session,
    *,
    order: Order,
    sub_status_id: Optional[int],
    operator_user_id: Optional[int],
) -> None:
    try:
        from .packaging_engine.smart_matching_triggers import on_order_status_changed_smart_matching

        on_order_status_changed_smart_matching(
            db,
            order=order,
            new_status_id=int(sub_status_id) if sub_status_id is not None else None,
            operator_user_id=operator_user_id,
        )
    except Exception:
        logger.exception("smart_matching trigger after status order_id=%s", getattr(order, "id", None))


def apply_order_panel_ui_status(
    db: Session,
    *,
    order: Order,
    sub_status_id: Optional[int],
    operator_user_id: Optional[int] = None,
) -> dict[str, Any]:
    """
    Ustawia ``order_ui_status_id`` (zawsze).

    Gdy ``order.cart_id`` jest ustawione:
    - jeśli detach dozwolony → CartLifecycle detach,
    - jeśli zablokowany → status zostaje zapisany, zamówienie zostaje na wózku.
    """
    new_sid = int(sub_status_id) if sub_status_id is not None else None
    order.order_ui_status_id = new_sid
    # Unikaj stale relationship przy serializacji w tej samej sesji.
    try:
        db.expire(order, ["order_ui_status"])
    except Exception:
        pass

    cart_id = getattr(order, "cart_id", None)
    if cart_id is None or int(cart_id) <= 0:
        db.add(order)
        _run_smart_matching_status_hook(
            db, order=order, sub_status_id=sub_status_id, operator_user_id=operator_user_id
        )
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
        from .order_fulfillment_state import clear_order_picking_session_context

        logger.warning(
            "[panel.ui_status] orphan cart_id=%s on order_id=%s — heal fields only",
            cid,
            int(order.id),
        )
        clear_order_picking_session_context(order)
        db.add(order)
        _run_smart_matching_status_hook(
            db, order=order, sub_status_id=sub_status_id, operator_user_id=operator_user_id
        )
        return {"status_updated": True, "detached": False, "healed_orphan_cart": True}

    allowed, block_reason = can_detach_order_from_cart(db, cart=cart, order=order)
    if not allowed:
        db.add(order)
        _run_smart_matching_status_hook(
            db, order=order, sub_status_id=sub_status_id, operator_user_id=operator_user_id
        )
        logger.info(
            "[panel.ui_status] status saved without detach order_id=%s cart_id=%s reason=%s",
            int(order.id),
            cid,
            block_reason,
        )
        return {
            "status_updated": True,
            "detached": False,
            "detach_blocked": True,
            "detach_reason": block_reason,
        }

    detach_order_from_cart(
        db,
        cart_id=cid,
        order_id=int(order.id),
        tenant_id=tid,
        warehouse_id=wid,
        operator_user_id=operator_user_id,
        reason="Odłączenie po zmianie statusu panelu zamówienia.",
    )
    # Detach nie przywraca UI status — upewnij się, że wybrany status zostaje.
    order.order_ui_status_id = new_sid
    try:
        db.expire(order, ["order_ui_status"])
    except Exception:
        pass
    db.add(order)
    _run_smart_matching_status_hook(
        db, order=order, sub_status_id=sub_status_id, operator_user_id=operator_user_id
    )
    return {"status_updated": True, "detached": True, "cart_id": cid}
