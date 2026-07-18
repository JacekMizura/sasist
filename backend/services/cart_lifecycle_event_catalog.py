"""
Katalog Event Log wózka.

event_code  — stabilny kod systemowy (logika / filtry / KPI).
description — wyłącznie UI, po polsku; NIGDY nie używać w logice.
severity    — INFO | SUCCESS | WARNING | ERROR | AUDIT

Zapis wpisów: wyłącznie CartLifecycleService → append_lifecycle_event.
"""

from __future__ import annotations

from typing import Literal

Severity = Literal["INFO", "SUCCESS", "WARNING", "ERROR", "AUDIT"]

SEVERITY_INFO: Severity = "INFO"
SEVERITY_SUCCESS: Severity = "SUCCESS"
SEVERITY_WARNING: Severity = "WARNING"
SEVERITY_ERROR: Severity = "ERROR"
SEVERITY_AUDIT: Severity = "AUDIT"

# --- event_code (system) ---
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
EVENT_ORDERS_ASSIGNED = "orders_assigned"
EVENT_ORDER_ADDED = "order_added"
EVENT_CAPACITY_BLOCKED = "capacity_blocked"
EVENT_BASKET_ASSIGNED = "basket_assigned"

# event_code → opis PL (tylko prezentacja)
EVENT_DESCRIPTIONS_PL: dict[str, str] = {
    EVENT_CART_CLAIMED: "Zarezerwowano wózek.",
    EVENT_PICKING_STARTED: "Rozpoczęto kompletację.",
    EVENT_FIRST_PRODUCT_CONFIRMED: "Potwierdzono pierwszy produkt.",
    EVENT_PICKING_FINISHED: "Zakończono kompletację.",
    EVENT_PACKING_STARTED: "Rozpoczęto pakowanie.",
    EVENT_ORDER_PACKED: "Spakowano zamówienie.",
    EVENT_PACKING_FINISHED: "Zakończono pakowanie.",
    EVENT_CART_RELEASED: "Zwolniono wózek.",
    EVENT_CART_AUTO_RELEASED_IDLE: "Sesja kompletacji została zakończona. Wózek został zwolniony z powodu braku aktywności.",
    EVENT_PICKING_CANCELLED: "Anulowano kompletację.",
    EVENT_PICKING_RESUMED: "Wznowiono kompletację.",
    EVENT_CART_TRANSFERRED: "Wózek został przejęty przez innego magazyniera.",
    EVENT_RESERVATION_TIMED_OUT: "Upłynął czas rezerwacji wózka.",
    EVENT_DOUBLE_CLAIM_ATTEMPT: "Wykryto próbę użycia wózka zajętego przez innego operatora.",
    EVENT_ORDERS_ASSIGNED: "Przypisano zamówienia do wózka.",
    EVENT_ORDER_ADDED: "Dodano zamówienie do wózka.",
    EVENT_CAPACITY_BLOCKED: "Nie udało się przypisać kolejnego zamówienia. Powód: brak wolnej pojemności.",
    EVENT_BASKET_ASSIGNED: "Przypisano zamówienie do koszyka.",
}

# event_code → severity
EVENT_SEVERITY: dict[str, Severity] = {
    EVENT_CART_CLAIMED: SEVERITY_INFO,
    EVENT_PICKING_STARTED: SEVERITY_INFO,
    EVENT_FIRST_PRODUCT_CONFIRMED: SEVERITY_SUCCESS,
    EVENT_PICKING_FINISHED: SEVERITY_SUCCESS,
    EVENT_PACKING_STARTED: SEVERITY_INFO,
    EVENT_ORDER_PACKED: SEVERITY_SUCCESS,
    EVENT_PACKING_FINISHED: SEVERITY_SUCCESS,
    EVENT_CART_RELEASED: SEVERITY_AUDIT,
    EVENT_CART_AUTO_RELEASED_IDLE: SEVERITY_WARNING,
    EVENT_PICKING_CANCELLED: SEVERITY_WARNING,
    EVENT_PICKING_RESUMED: SEVERITY_INFO,
    EVENT_CART_TRANSFERRED: SEVERITY_AUDIT,
    EVENT_RESERVATION_TIMED_OUT: SEVERITY_WARNING,
    EVENT_DOUBLE_CLAIM_ATTEMPT: SEVERITY_ERROR,
    EVENT_ORDERS_ASSIGNED: SEVERITY_SUCCESS,
    EVENT_ORDER_ADDED: SEVERITY_INFO,
    EVENT_CAPACITY_BLOCKED: SEVERITY_WARNING,
    EVENT_BASKET_ASSIGNED: SEVERITY_INFO,
}


def description_pl(event_code: str, *, override: str | None = None) -> str:
    """Opis dla użytkownika. Nie używać wyniku w warunkach biznesowych."""
    if override and str(override).strip():
        return str(override).strip()[:512]
    code = str(event_code or "").strip()
    return EVENT_DESCRIPTIONS_PL.get(code, code)[:512]


def severity_for(event_code: str, *, override: str | None = None) -> Severity:
    """Poziom ważności z katalogu (lub jawny override)."""
    if override:
        u = str(override).strip().upper()
        if u in ("INFO", "SUCCESS", "WARNING", "ERROR", "AUDIT"):
            return u  # type: ignore[return-value]
    code = str(event_code or "").strip()
    return EVENT_SEVERITY.get(code, SEVERITY_INFO)
