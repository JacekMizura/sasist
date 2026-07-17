"""
Katalog Event Log wózka — opisy wyłącznie po polsku (gotowe do UI).

Zapis wpisów: wyłącznie CartLifecycleService → append_lifecycle_event.
"""

from __future__ import annotations

# Kody techniczne (stabilne) → opis PL
EVENT_CART_CLAIMED = "cart_claimed"
EVENT_PICKING_STARTED = "picking_started"
EVENT_FIRST_PRODUCT_CONFIRMED = "first_product_confirmed"
EVENT_PICKING_FINISHED = "picking_finished"
EVENT_PACKING_STARTED = "packing_started"
EVENT_ORDER_PACKED = "order_packed"
EVENT_PACKING_FINISHED = "packing_finished"
EVENT_CART_RELEASED = "cart_released"
EVENT_CART_AUTO_RELEASED_IDLE = "cart_auto_released_idle"
EVENT_PICKING_CANCELLED = "picking_cancelled"
EVENT_PICKING_RESUMED = "picking_resumed"
EVENT_CART_TRANSFERRED = "cart_transferred"
EVENT_RESERVATION_TIMED_OUT = "reservation_timed_out"
EVENT_DOUBLE_CLAIM_ATTEMPT = "double_claim_attempt"

EVENT_DESCRIPTIONS_PL: dict[str, str] = {
    EVENT_CART_CLAIMED: "Wózek został zarezerwowany",
    EVENT_PICKING_STARTED: "Rozpoczęto kompletację",
    EVENT_FIRST_PRODUCT_CONFIRMED: "Potwierdzono pierwszy produkt",
    EVENT_PICKING_FINISHED: "Zakończono kompletację",
    EVENT_PACKING_STARTED: "Rozpoczęto pakowanie",
    EVENT_ORDER_PACKED: "Spakowano zamówienie",
    EVENT_PACKING_FINISHED: "Zakończono pakowanie",
    EVENT_CART_RELEASED: "Wózek został zwolniony",
    EVENT_CART_AUTO_RELEASED_IDLE: "Automatycznie zwolniono wózek z powodu braku aktywności",
    EVENT_PICKING_CANCELLED: "Anulowano kompletację",
    EVENT_PICKING_RESUMED: "Wznowiono kompletację",
    EVENT_CART_TRANSFERRED: "Przekazano wózek innemu operatorowi",
    EVENT_RESERVATION_TIMED_OUT: "Upłynął czas rezerwacji",
    EVENT_DOUBLE_CLAIM_ATTEMPT: "Wykryto próbę podwójnej rezerwacji",
}


def description_pl(event_type: str, *, override: str | None = None) -> str:
    if override and str(override).strip():
        return str(override).strip()[:512]
    code = str(event_type or "").strip()
    return EVENT_DESCRIPTIONS_PL.get(code, code)[:512]
