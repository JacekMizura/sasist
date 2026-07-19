"""Stable MULTI basket-put scan error codes (machine-readable → operator message)."""

from __future__ import annotations

# SELECT_PRODUCT / shared
PRODUCT_NOT_IN_PICKING = "PRODUCT_NOT_IN_PICKING"
PRODUCT_ALREADY_COMPLETE = "PRODUCT_ALREADY_COMPLETE"
EXPECTED_PRODUCT_SCAN = "EXPECTED_PRODUCT_SCAN"
UNKNOWN_SCAN_CODE = "UNKNOWN_SCAN_CODE"
CART_NOT_ACTIVE = "CART_NOT_ACTIVE"

# AWAITING_BASKET
EXPECTED_BASKET_SCAN = "EXPECTED_BASKET_SCAN"
NO_PENDING_PUT = "NO_PENDING_PUT"
PENDING_PUT_EXISTS = "PENDING_PUT_EXISTS"
BASKET_MISMATCH = "BASKET_MISMATCH"
BASKET_OTHER_CART = "BASKET_OTHER_CART"
BASKET_EMPTY = "BASKET_EMPTY"
BASKET_PRODUCT_MISMATCH = "BASKET_PRODUCT_MISMATCH"
BASKET_PRODUCT_ALREADY_COMPLETE = "BASKET_PRODUCT_ALREADY_COMPLETE"
BASKET_PUT_OWNED_BY_OTHER = "BASKET_PUT_OWNED_BY_OTHER"

# ACTIVE_SERIES
OVERPICK_BLOCKED = "OVERPICK_BLOCKED"
SERIES_DESTINATION_SWITCHED = "SERIES_DESTINATION_SWITCHED"
FOREIGN_SKU_ON_SERIES = "FOREIGN_SKU_ON_SERIES"
QUANTITY_INVALID = "QUANTITY_INVALID"
QUANTITY_EXCEEDS_REMAINING = "QUANTITY_EXCEEDS_REMAINING"
QUANTITY_STALE = "QUANTITY_STALE"

# Legacy alias kept in FE mapper
AWAITING_BASKET_CONFIRMATION = "AWAITING_BASKET_CONFIRMATION"

OPERATOR_MESSAGES: dict[str, str] = {
    PRODUCT_NOT_IN_PICKING: "Ten produkt nie znajduje się na liście do zebrania.",
    PRODUCT_ALREADY_COMPLETE: "Ten produkt został już zebrany w wymaganej ilości.",
    EXPECTED_PRODUCT_SCAN: "Otwórz produkt na liście albo zeskanuj EAN — potem możesz wybrać koszyk.",
    UNKNOWN_SCAN_CODE: "Nie rozpoznano zeskanowanego kodu.",
    CART_NOT_ACTIVE: "Ten wózek nie należy do aktywnego zbierania.",
    EXPECTED_BASKET_SCAN: (
        "Oczekiwany jest teraz skan koszyka. Najpierw odłóż zeskanowany produkt do koszyka."
    ),
    NO_PENDING_PUT: "Zeskanuj EAN produktu, aby dodać sztukę do aktywnego koszyka.",
    PENDING_PUT_EXISTS: "Najpierw odłóż poprzednio zeskanowaną sztukę do koszyka.",
    BASKET_MISMATCH: "Oczekiwany jest skan koszyka. Nie rozpoznano tego kodu jako właściwego koszyka.",
    BASKET_OTHER_CART: "Ten koszyk należy do innego wózka.",
    BASKET_EMPTY: "Ten koszyk nie ma przypisanego zamówienia.",
    BASKET_PRODUCT_MISMATCH: "Ten produkt nie należy do zamówienia przypisanego do tego koszyka.",
    BASKET_PRODUCT_ALREADY_COMPLETE: "W tym koszyku zebrano już pełną wymaganą ilość tego produktu.",
    BASKET_PUT_OWNED_BY_OTHER: "To oczekujące odłożenie należy do innego operatora.",
    OVERPICK_BLOCKED: "Zebrano już pełną wymaganą ilość tego produktu.",
    FOREIGN_SKU_ON_SERIES: "Aktywna seria dotyczy innego produktu. Zeskanuj właściwy EAN albo zmień kontekst.",
    QUANTITY_INVALID: "Ilość musi być większa od zera.",
    QUANTITY_EXCEEDS_REMAINING: "Nie możesz odłożyć więcej niż pozostało w koszyku dla tego produktu.",
    QUANTITY_STALE: "Pozostała ilość zmieniła się. Odśwież i podaj ilość ponownie.",
    AWAITING_BASKET_CONFIRMATION: (
        "Oczekiwany jest teraz skan koszyka. Najpierw odłóż zeskanowany produkt do koszyka."
    ),
}


def operator_message(code: str, fallback: str | None = None) -> str:
    return OPERATOR_MESSAGES.get(code) or fallback or "Nie można wykonać tego skanu w aktualnym stanie."
