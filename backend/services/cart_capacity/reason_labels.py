"""Polish labels for Capacity Analytics reject/assign reason codes."""

from __future__ import annotations

REASON_LABELS_PL: dict[str, str] = {
    "orders_limit": "Brak wolnej pojemności",
    "volume_limit": "Brak wolnej objętości",
    "no_basket": "Nie mieści się do koszyka",
    "capacity_reached": "Brak wolnej pojemności",
    "already_assigned": "Zamówienie już przypisane",
    "no_location": "Brak lokalizacji",
    "unknown_strategy": "Nieznana strategia pojemności",
    "assigned": "Przypisano",
}


def reason_label_pl(code: str | None) -> str:
    c = str(code or "").strip()
    if not c:
        return "Inny powód"
    return REASON_LABELS_PL.get(c, c)
