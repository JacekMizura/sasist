"""Catalog of WMS operational mode keys (terminal / floor workflows).

Keys must stay aligned with frontend ``WMS_MODULES[].operationalMode`` /
``constants/wmsOperationalModes.ts``. Empty user list = all **floor** modes allowed.

Module hubs that used to live here (Operacje, Wózki, …) are module permissions —
see ``LEGACY_WMS_MODULE_MODE_TO_PERMISSION``.
"""

from __future__ import annotations

# Floor / terminal modes only — used during warehouse work.
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
)

# Former "Tryby operacyjne WMS" entries that are system modules (Uprawnienia).
# Kept for dual-read / one-time migration of stored JSON — not shown in modes UI.
LEGACY_WMS_MODULE_MODE_TO_PERMISSION: dict[str, str] = {
    "operations": "warehouse.operations",
    "carts": "warehouse.carts",
    "qc": "warehouse.qc",
    "documents": "documents.view",
    "analytics": "analytics.view",
    "purchasing": "purchasing.view",
    "labels": "workforce.ops.label_templates",
}

LEGACY_WMS_MODULE_MODE_KEYS: frozenset[str] = frozenset(LEGACY_WMS_MODULE_MODE_TO_PERMISSION.keys())

_FLOOR_MODE_KEYS: frozenset[str] = frozenset(k for k, _ in WMS_OPERATIONAL_MODES)


def is_valid_wms_mode(key: str) -> bool:
    """True for current floor operational modes (writable catalog)."""
    return key in _FLOOR_MODE_KEYS


def is_legacy_wms_module_mode(key: str) -> bool:
    return key in LEGACY_WMS_MODULE_MODE_KEYS


def split_wms_modes_and_legacy_permissions(
    modes: list[str] | tuple[str, ...] | None,
) -> tuple[list[str], list[str]]:
    """
    Split stored mode keys into floor modes + permission keys to grant.

    Unknown keys are dropped. Legacy module keys become permission grants and
    are removed from the modes list.
    """
    floor: list[str] = []
    perms: list[str] = []
    seen_floor: set[str] = set()
    seen_perm: set[str] = set()
    for raw in modes or []:
        key = str(raw).strip()
        if not key:
            continue
        if key in LEGACY_WMS_MODULE_MODE_TO_PERMISSION:
            pk = LEGACY_WMS_MODULE_MODE_TO_PERMISSION[key]
            if pk not in seen_perm:
                seen_perm.add(pk)
                perms.append(pk)
            continue
        if key in _FLOOR_MODE_KEYS and key not in seen_floor:
            seen_floor.add(key)
            floor.append(key)
    return floor, perms
