"""
Katalog Event Log wózka.

event_code  — stabilny kod systemowy (logika / filtry / KPI).
title_pl    — krótka nazwa kolumny „Zdarzenie” (UI).
description — pełny komunikat UI, po polsku; NIGDY nie używać w logice.
severity    — INFO | SUCCESS | WARNING | ERROR | AUDIT

Zapis wpisów: wyłącznie CartLifecycleService → append_lifecycle_event.
"""

from __future__ import annotations

from typing import Any, Literal

Severity = Literal["INFO", "SUCCESS", "WARNING", "ERROR", "AUDIT"]

SEVERITY_INFO: Severity = "INFO"
SEVERITY_SUCCESS: Severity = "SUCCESS"
SEVERITY_WARNING: Severity = "WARNING"
SEVERITY_ERROR: Severity = "ERROR"
SEVERITY_AUDIT: Severity = "AUDIT"

UNKNOWN_EVENT_TITLE_PL = "Zdarzenie systemowe"
UNKNOWN_EVENT_DESCRIPTION_PL = "Zarejestrowano zdarzenie systemowe."

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
EVENT_ADMIN_CART_RELEASED = "admin_cart_released"
EVENT_ADMIN_ORDERS_DETACHED = "admin_orders_detached"
EVENT_ADMIN_PICKING_CANCELLED = "admin_picking_cancelled"
EVENT_ORDER_DETACHED = "order_detached"
EVENT_EMPTY_ORPHAN_CART_RELEASED = "empty_orphan_cart_released"

# event_code → krótki tytuł PL (kolumna Zdarzenie)
EVENT_TITLES_PL: dict[str, str] = {
    EVENT_CART_CLAIMED: "Zarezerwowano wózek",
    EVENT_PICKING_STARTED: "Rozpoczęto zbieranie",
    EVENT_FIRST_PRODUCT_CONFIRMED: "Potwierdzono pierwszy produkt",
    EVENT_PICKING_FINISHED: "Zakończono zbieranie",
    EVENT_PACKING_STARTED: "Rozpoczęto pakowanie",
    EVENT_ORDER_PACKED: "Spakowano zamówienie",
    EVENT_PACKING_FINISHED: "Zakończono pakowanie",
    EVENT_CART_RELEASED: "Zwolniono wózek",
    EVENT_CART_AUTO_RELEASED_IDLE: "Automatycznie zwolniono nieaktywny wózek",
    EVENT_PICKING_CANCELLED: "Anulowano zbieranie",
    EVENT_PICKING_RESUMED: "Wznowiono zbieranie",
    EVENT_CART_TRANSFERRED: "Przejęto wózek",
    EVENT_RESERVATION_TIMED_OUT: "Wygasła rezerwacja wózka",
    EVENT_DOUBLE_CLAIM_ATTEMPT: "Próba użycia zajętego wózka",
    EVENT_ORDERS_ASSIGNED: "Przypisano zamówienia",
    EVENT_ORDER_ADDED: "Dodano zamówienie",
    EVENT_CAPACITY_BLOCKED: "Brak pojemności wózka",
    EVENT_BASKET_ASSIGNED: "Przypisano koszyk",
    EVENT_ADMIN_CART_RELEASED: "Zwolniono wózek przez administratora",
    EVENT_ADMIN_ORDERS_DETACHED: "Odłączono zamówienia",
    EVENT_ADMIN_PICKING_CANCELLED: "Anulowano zbieranie przez administratora",
    EVENT_ORDER_DETACHED: "Odłączono zamówienie",
    EVENT_EMPTY_ORPHAN_CART_RELEASED: "Zwolniono pusty wózek",
}

# event_code → domyślny komunikat PL (tylko prezentacja)
EVENT_DESCRIPTIONS_PL: dict[str, str] = {
    EVENT_CART_CLAIMED: "Zarezerwowano wózek.",
    EVENT_PICKING_STARTED: "Rozpoczęto zbieranie.",
    EVENT_FIRST_PRODUCT_CONFIRMED: "Potwierdzono pierwszy produkt.",
    EVENT_PICKING_FINISHED: "Zakończono zbieranie.",
    EVENT_PACKING_STARTED: "Rozpoczęto pakowanie.",
    EVENT_ORDER_PACKED: "Spakowano zamówienie.",
    EVENT_PACKING_FINISHED: "Zakończono pakowanie.",
    EVENT_CART_RELEASED: "Zwolniono wózek.",
    EVENT_CART_AUTO_RELEASED_IDLE: (
        "Sesja kompletacji została zakończona. Wózek został zwolniony z powodu braku aktywności."
    ),
    EVENT_PICKING_CANCELLED: "Anulowano zbieranie.",
    EVENT_PICKING_RESUMED: "Wznowiono zbieranie.",
    EVENT_CART_TRANSFERRED: "Wózek został przejęty przez innego magazyniera.",
    EVENT_RESERVATION_TIMED_OUT: "Upłynął czas rezerwacji wózka.",
    EVENT_DOUBLE_CLAIM_ATTEMPT: "Wykryto próbę użycia wózka zajętego przez innego operatora.",
    EVENT_ORDERS_ASSIGNED: "Przypisano zamówienia do wózka.",
    EVENT_ORDER_ADDED: "Dodano zamówienie do wózka.",
    EVENT_CAPACITY_BLOCKED: "Nie udało się przypisać kolejnego zamówienia. Powód: brak wolnej pojemności.",
    EVENT_BASKET_ASSIGNED: "Przypisano zamówienie do koszyka.",
    EVENT_ADMIN_CART_RELEASED: "Administrator ręcznie zwolnił wózek.",
    EVENT_ADMIN_ORDERS_DETACHED: "Odłączono zamówienia od wózka.",
    EVENT_ADMIN_PICKING_CANCELLED: "Anulowano zbieranie przez administratora.",
    EVENT_ORDER_DETACHED: "Odłączono zamówienie od wózka.",
    EVENT_EMPTY_ORPHAN_CART_RELEASED: "Zwolniono pusty wózek.",
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
    EVENT_ADMIN_CART_RELEASED: SEVERITY_AUDIT,
    EVENT_ADMIN_ORDERS_DETACHED: SEVERITY_WARNING,
    EVENT_ADMIN_PICKING_CANCELLED: SEVERITY_WARNING,
    EVENT_ORDER_DETACHED: SEVERITY_WARNING,
    EVENT_EMPTY_ORPHAN_CART_RELEASED: SEVERITY_AUDIT,
}


def normalize_event_code(event_code: str | None) -> str:
    raw = str(event_code or "").strip()
    if not raw:
        return ""
    return "_".join(raw.replace("-", "_").split()).lower()


def title_pl(event_code: str) -> str:
    """Krótka nazwa zdarzenia dla UI. Nigdy nie zwraca surowego kodu angielskiego."""
    code = normalize_event_code(event_code)
    return EVENT_TITLES_PL.get(code, UNKNOWN_EVENT_TITLE_PL)


def description_pl(event_code: str, *, override: str | None = None) -> str:
    """Opis dla użytkownika. Nie używać wyniku w warunkach biznesowych."""
    if override and str(override).strip():
        text = str(override).strip()
        norm = normalize_event_code(text)
        # Machine code passed as override → ignore
        if norm == normalize_event_code(event_code) and "_" in norm and " " not in text:
            code = normalize_event_code(event_code)
            return EVENT_DESCRIPTIONS_PL.get(code, UNKNOWN_EVENT_DESCRIPTION_PL)[:512]
        return text[:512]
    code = normalize_event_code(event_code)
    return EVENT_DESCRIPTIONS_PL.get(code, UNKNOWN_EVENT_DESCRIPTION_PL)[:512]


def severity_for(event_code: str, *, override: str | None = None) -> Severity:
    """Poziom ważności z katalogu (lub jawny override)."""
    if override:
        u = str(override).strip().upper()
        if u in ("INFO", "SUCCESS", "WARNING", "ERROR", "AUDIT"):
            return u  # type: ignore[return-value]
    code = normalize_event_code(event_code)
    return EVENT_SEVERITY.get(code, SEVERITY_INFO)


def _format_order_list(nums: list[str]) -> str:
    cleaned: list[str] = []
    for n in nums:
        s = str(n or "").strip()
        if not s:
            continue
        cleaned.append(s if s.startswith("#") else f"#{s}")
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} i {cleaned[1]}"
    return ", ".join(cleaned[:-1]) + f" i {cleaned[-1]}"


def compose_informative_message(
    event_code: str,
    *,
    stored_description: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """
    Buduje informacyjny komunikat PL z kontekstu (presentation-time).
    Nie migruje historii — wzbogaca wyświetlanie.
    """
    code = normalize_event_code(event_code)
    meta = dict(metadata or {})
    stored = (stored_description or "").strip()

    order_nums: list[str] = []
    raw_orders = meta.get("order_numbers") or meta.get("orders")
    if isinstance(raw_orders, list):
        order_nums = [str(x) for x in raw_orders if str(x or "").strip()]
    orders_txt = _format_order_list(order_nums)
    cart_code = str(meta.get("cart_code") or meta.get("cart_label") or "").strip()

    if code in (EVENT_PICKING_CANCELLED, EVENT_ADMIN_PICKING_CANCELLED):
        parts: list[str] = []
        if orders_txt:
            parts.append(f"Anulowano zbieranie zamówień {orders_txt}.")
        else:
            parts.append("Anulowano zbieranie.")
        undone = meta.get("undone_picks") or []
        qty = 0.0
        if isinstance(undone, list):
            for u in undone:
                if isinstance(u, dict):
                    try:
                        qty += float(u.get("quantity") or u.get("qty") or 0)
                    except (TypeError, ValueError):
                        pass
        loc_restored = float(meta.get("location_qty_restored") or 0)
        if qty > 0 or loc_restored > 0:
            n = int(qty) if qty == int(qty) else round(qty, 2)
            if n <= 0 and loc_restored > 0:
                n = int(loc_restored) if loc_restored == int(loc_restored) else round(loc_restored, 2)
            parts.append(f"Cofnięto pobranie {n} szt. produktów.")
        put_back = meta.get("put_back_required") or []
        if isinstance(put_back, list) and put_back:
            lines: list[str] = []
            for row in put_back[:8]:
                if not isinstance(row, dict):
                    continue
                name = str(row.get("product_name") or row.get("sku") or "Produkt").strip()
                q = row.get("quantity") or row.get("qty") or 0
                loc = str(row.get("location_code") or row.get("location") or "").strip()
                try:
                    qn = int(q) if float(q) == int(float(q)) else round(float(q), 2)
                except (TypeError, ValueError):
                    qn = q
                bit = f"{name} — {qn} szt."
                if loc:
                    bit += f" → {loc}"
                lines.append(bit)
            if lines:
                parts.append("Do odłożenia: " + "; ".join(lines) + ".")
        if cart_code:
            parts.append(f"Wózek {cart_code} został zwolniony.")
        return " ".join(parts)[:512]

    if code == EVENT_ORDERS_ASSIGNED and orders_txt:
        base = f"Przypisano zamówienia {orders_txt} do wózka"
        if cart_code:
            base += f" {cart_code}"
        return (base + ".")[:512]

    if code == EVENT_ORDER_PACKED and orders_txt:
        first = orders_txt.split(" i ")[0].split(",")[0].strip()
        return (f"Spakowano zamówienie {first}.")[:512]

    if code in (EVENT_CART_RELEASED, EVENT_ADMIN_CART_RELEASED, EVENT_CART_AUTO_RELEASED_IDLE):
        if cart_code:
            if code == EVENT_CART_AUTO_RELEASED_IDLE:
                return (f"Automatycznie zwolniono nieaktywny wózek {cart_code}.")[:512]
            if code == EVENT_ADMIN_CART_RELEASED:
                return (f"Administrator zwolnił wózek {cart_code}.")[:512]
            return (f"Zwolniono wózek {cart_code}.")[:512]

    if code == EVENT_ADMIN_ORDERS_DETACHED and orders_txt:
        msg = f"Odłączono zamówienia {orders_txt}"
        if cart_code:
            msg += f" od wózka {cart_code}"
        return (msg + ".")[:512]

    title = EVENT_TITLES_PL.get(code, "")
    if stored and stored.upper() not in {title.upper(), title.upper().replace(".", "")}:
        if len(stored) > len(title) + 5 or any(ch in stored for ch in "ąćęłńóśźż."):
            return stored[:512]

    return description_pl(code, override=None)
