"""Centralized Polish labels for operational sales, payments, and documents."""

from __future__ import annotations

_PAYMENT_METHOD_PL = {
    "CASH": "Gotówka",
    "CARD": "Karta",
    "BLIK": "BLIK",
    "MIXED": "Mieszana",
    "TRANSFER": "Przelew",
}

_PAYMENT_STATUS_PL = {
    "PAID": "Opłacone",
    "SETTLED": "Rozliczone",
    "CAPTURED": "Zaksięgowane",
    "PENDING": "Oczekuje",
    "FAILED": "Nieudane",
    "CANCELLED": "Anulowane",
    "REFUNDED": "Zwrócone",
}

_DOCUMENT_STATUS_PL = {
    "PENDING": "W kolejce",
    "RETRYING": "Ponawianie",
    "PROCESSING": "Generowanie",
    "GENERATED": "Gotowy",
    "COMPLETED": "Gotowy",
    "DONE": "Gotowy",
    "FAILED": "Błąd",
    "CANCELLED": "Anulowany",
}

_DOCUMENT_SUBTYPE_PL = {
    "INVOICE": "Faktura",
    "RECEIPT": "Paragon",
    "WZ": "WZ",
    "PZ": "PZ",
    "CORRECTION": "Korekta",
}

_FISCAL_STATUS_PL = {
    "PENDING": "Oczekuje na fiskalizację",
    "SENT": "Wysłano do kasy",
    "ACCEPTED": "Zafiskalizowano",
    "FAILED": "Błąd fiskalizacji",
}


def payment_method_label_pl(method: str | None) -> str:
    m = str(method or "").strip().upper()
    if not m:
        return "—"
    return _PAYMENT_METHOD_PL.get(m, m)


def payment_status_label_pl(status: str | None) -> str:
    s = str(status or "").strip().upper()
    if not s:
        return "—"
    return _PAYMENT_STATUS_PL.get(s, s)


def document_status_label_pl(status: str | None) -> str:
    s = str(status or "").strip().upper()
    if not s:
        return "—"
    return _DOCUMENT_STATUS_PL.get(s, s)


def document_subtype_label_pl(subtype: str | None) -> str:
    s = str(subtype or "").strip().upper()
    if not s:
        return "—"
    return _DOCUMENT_SUBTYPE_PL.get(s, s)


def fiscal_status_label_pl(status: str | None) -> str:
    s = str(status or "").strip().upper()
    if not s:
        return "—"
    return _FISCAL_STATUS_PL.get(s, s)


def print_button_label_pl(*, document_subtype: str | None, document_type: str | None = None) -> str:
    sub = str(document_subtype or document_type or "").strip().upper()
    if sub in ("INVOICE", "FV"):
        return "Drukuj fakturę"
    if sub in ("RECEIPT", "PA", "PARAGON"):
        return "Drukuj paragon"
    if sub == "WZ":
        return "Drukuj WZ"
    return "Drukuj dokument"
