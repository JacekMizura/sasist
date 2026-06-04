"""Faza workflow WMS wyłącznie ze znaczników zamówienia i ``cart_id`` — bez wyprowadzania ze stanów picków."""

from __future__ import annotations

from typing import TYPE_CHECKING

from ..models.order import Order

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


def compute_wms_workflow_phase(order: Order, db: "Session | None" = None) -> str | None:
    """
    Kolejność (pierwsze pasujące):
    - NEEDS_DECISION / MISSING tylko gdy ``order_has_pending_shortage_decision`` (gdy ``db``)
    - PACKED: ``packed_at`` (koniec pakowania)
    - PACKING: ``packing_started_at`` ustawione, brak ``packed_at``
    - READY_TO_PACK: ``picking_finished_at`` (lub legacy ``picked_at``), bez startu pakowania
    - PICKING: ``cart_id`` ustawione, zbieranie nie domknięte znacznikiem
    - Brak fazy: zamówienie nie weszło jeszcze w operacyjny przepływ WMS
    """
    fs = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    shortage_phase_stale = False
    if fs in ("NEEDS_DECISION", "MISSING"):
        if db is not None:
            from .braki_order_state_service import order_has_pending_shortage_decision

            if order_has_pending_shortage_decision(db, order):
                return fs
            shortage_phase_stale = True
        else:
            return fs

    pe = getattr(order, "packed_at", None)
    pr = getattr(order, "packing_started_at", None)
    pf = getattr(order, "picking_finished_at", None) or getattr(order, "picked_at", None)
    cid = getattr(order, "cart_id", None)
    has_cart = cid is not None and int(cid) > 0

    if pe is not None:
        return "PACKED"
    if pr is not None:
        return "PACKING"
    if pf is not None:
        return "READY_TO_PACK"
    if has_cart:
        return "PICKING"
    if shortage_phase_stale and db is not None:
        from .braki_order_state_service import order_can_show_ready_pack

        if order_can_show_ready_pack(db, order):
            return "READY_TO_PACK"
    return None
