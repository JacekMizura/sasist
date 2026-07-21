"""Catalog of WMS operational mode keys (visibility / workflows; extend over time).

Keys must stay aligned with frontend ``WMS_MODULES[].operationalMode`` /
``constants/wmsOperationalModes.ts``. Empty user list = all modes allowed (admin default).
"""

from __future__ import annotations

WMS_OPERATIONAL_MODES: tuple[tuple[str, str], ...] = (
    ("receiving", "Przyjęcie"),
    ("putaway", "Rozlokowanie PZ"),
    ("picking", "Zbieranie"),
    ("packing", "Pakowanie"),
    ("issues", "Braki"),
    ("inventory", "Inwentaryzacja"),
    ("product_preview", "Podgląd produktu"),
    ("returns", "Zwroty / Reklamacje"),
    ("complaints", "Reklamacje"),
    ("direct_sales", "Sprzedaż stacjonarna"),
    ("production", "Produkcja"),
    ("consolidations", "Kompletacja międzymagazynowa"),
    ("mm", "Przesunięcia magazynowe"),
    ("operations", "Operacje"),
    ("carts", "Wózki"),
    ("qc", "Kontrola jakości"),
    ("documents", "Dokumenty"),
    ("analytics", "Analiza"),
    ("purchasing", "Zakupy"),
    ("labels", "System etykiet"),
)


def is_valid_wms_mode(key: str) -> bool:
    return key in {k for k, _ in WMS_OPERATIONAL_MODES}
