"""Reason codes + etykiety PL (SSOT tekstów — FE nie tłumaczy kodów)."""

from __future__ import annotations

from typing import Final

REASON_MISSING_PICKING_LOCATION: Final = "MISSING_PICKING_LOCATION"
REASON_INSUFFICIENT_PICKABLE_STOCK: Final = "INSUFFICIENT_PICKABLE_STOCK"
REASON_LOCATION_BLOCKED: Final = "LOCATION_BLOCKED"
REASON_PRODUCT_NOT_PICKABLE: Final = "PRODUCT_NOT_PICKABLE"

REASON_LABELS: dict[str, str] = {
    REASON_MISSING_PICKING_LOCATION: "Brak lokalizacji pickingowej",
    REASON_INSUFFICIENT_PICKABLE_STOCK: "Niewystarczający dostępny stock do kompletacji",
    REASON_LOCATION_BLOCKED: "Lokalizacja zablokowana (inwentaryzacja / pusta lokalizacja)",
    REASON_PRODUCT_NOT_PICKABLE: "Produkt nie nadaje się do kompletacji WMS",
}


def reason_label(code: str) -> str:
    return REASON_LABELS.get(str(code), str(code))
