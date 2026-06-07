"""Catalog of WMS operational mode keys (visibility / workflows; extend over time)."""

from __future__ import annotations

WMS_OPERATIONAL_MODES: tuple[tuple[str, str], ...] = (
    ("packing", "Pakowanie"),
    ("picking", "Zbieranie"),
    ("returns", "Zwroty"),
    ("complaints", "Reklamacje"),
    ("receiving", "Przyjęcia"),
    ("inventory", "Inwentaryzacja"),
    ("carts", "Wózki"),
    ("qc", "Kontrola jakości"),
    ("documents", "Dokumenty"),
    ("analytics", "Analiza"),
    ("purchasing", "Zakupy"),
    ("labels", "System etykiet"),
    ("production", "Produkcja"),
)


def is_valid_wms_mode(key: str) -> bool:
    return key in {k for k, _ in WMS_OPERATIONAL_MODES}
