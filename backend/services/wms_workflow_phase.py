"""Faza workflow WMS wyłącznie ze znaczników zamówienia i ``cart_id`` — bez wyprowadzania ze stanów picków."""

from __future__ import annotations

from ..models.order import Order


def compute_wms_workflow_phase(order: Order) -> str | None:
    """
    Kolejność (pierwsze pasujące):
    - NEEDS_DECISION / MISSING z ``fulfillment_state`` (braki po domknięciu sesji zbierania)
    - PACKED: ``packed_at`` (koniec pakowania)
    - PACKING: ``packing_started_at`` ustawione, brak ``packed_at``
    - READY_TO_PACK: ``picking_finished_at`` (lub legacy ``picked_at``), bez startu pakowania
    - PICKING: ``cart_id`` ustawione, zbieranie nie domknięte znacznikiem
    - Brak fazy: zamówienie nie weszło jeszcze w operacyjny przepływ WMS (bez wózka i znaczników) —
      **nie** zwracamy sztucznego ``TO_PICK``, żeby UI nie pokazywało „w kolejce” dla zamówień poza WMS.
    """
    fs = (getattr(order, "fulfillment_state", None) or "").strip().upper()
    if fs in ("NEEDS_DECISION", "MISSING"):
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
    return None
