"""Jednolite pole ``Order.fulfillment_state`` dla WMS: zbieranie, braki, pakowanie."""

from __future__ import annotations

import logging
from datetime import datetime

from ..models.order import Order

logger = logging.getLogger(__name__)

# PICKING — w kolejce / trwa zbieranie; PARTIAL — część linii; MISSING — zgłoszony brak;
# READY_TO_PACK — po finalizacji wózka; TO_PUTAWAY — zwrot / przesunięcie (np. anulowane ze zbiorem).
FulfillmentState = str

PICKING = "PICKING"
PARTIAL = "PARTIAL"
MISSING = "MISSING"
NEEDS_DECISION = "NEEDS_DECISION"
READY_TO_PACK = "READY_TO_PACK"
PACKING = "PACKING"
TO_PUTAWAY = "TO_PUTAWAY"

# Alias: użytkownik / SSOT lifecycle — to samo co PICKING
PICKING_IN_PROGRESS = PICKING



def clear_order_picking_session_context(order: Order) -> None:
    """
    Low-level field clear: cart_id / basket_id / picking_session_id.

    Wyłącznie z wnętrza CartLifecycle (lub orphan-heal gdy wózek nie istnieje).
    Nie wołać z API / panelu jako „detach”.
    """
    logger.info(
        "wms fulfillment clear context: order.id=%s status=%s fulfillment_state=%s cart_id(before)=%s",
        order.id,
        getattr(order, "status", None),
        getattr(order, "fulfillment_state", None),
        getattr(order, "cart_id", None),
    )
    order.cart_id = None
    order.basket_id = None
    if getattr(order, "picking_session_id", None) is not None:
        order.picking_session_id = None


def apply_fulfillment_state(
    order: Order,
    state: str,
    *,
    clear_cart: bool = False,
    clear_session: bool = False,
    invoke_packing_lifecycle: bool = True,
) -> None:
    """
    Ustaw ``fulfillment_state``.

    ``clear_cart`` / ``clear_session`` muszą być False — odłączenie wózka tylko przez CartLifecycle.
    """
    if clear_cart or clear_session:
        raise RuntimeError(
            "apply_fulfillment_state(clear_cart/clear_session) jest zabronione — "
            "użyj CartLifecycle.detach_order_from_cart / cancel_picking / release_cart"
        )
    prev = getattr(order, "fulfillment_state", None)
    order.fulfillment_state = state
    logger.info(
        "wms fulfillment: order.id=%s order.status=%s fulfillment_state %s -> %s cart_id=%s",
        order.id,
        getattr(order, "status", None),
        prev,
        state,
        getattr(order, "cart_id", None),
    )
    state_u = (state or "").strip().upper()
    # Domknięcie zbierania (w tym braki / decyzja / przekazanie do pakowania)
    if state_u in (READY_TO_PACK, PACKING, "NEEDS_DECISION", "MISSING"):
        if invoke_packing_lifecycle:
            from .order_fulfillment_lifecycle_service import on_packing_started

            on_packing_started(order)
        now = datetime.utcnow()
        if getattr(order, "picking_finished_at", None) is None:
            order.picking_finished_at = now
        if state_u in (READY_TO_PACK, PACKING) and getattr(order, "picked_at", None) is None:
            order.picked_at = now


def touch_picking_in_progress(order: Order) -> None:
    """Pierwszy pick / praca na zamówieniu: oznacz jako PICKING jeśli jeszcze nie ustawione."""
    from .order_fulfillment_lifecycle_service import on_picking_started

    on_picking_started(order)
    cur = getattr(order, "fulfillment_state", None)
    if cur in (None, ""):
        order.fulfillment_state = PICKING
        if getattr(order, "picking_started_at", None) is None:
            order.picking_started_at = datetime.utcnow()
        logger.info(
            "wms fulfillment: order.id=%s touch PICKING (was empty) cart_id=%s",
            order.id,
            getattr(order, "cart_id", None),
        )
