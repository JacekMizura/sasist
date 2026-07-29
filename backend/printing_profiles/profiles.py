"""Print profiles — SSOT for how documents are printed (not WMS modules).

Workstation maps a printer to a profile. Every document type belongs to exactly
one profile. Adding a new document = assign it here; workstation UI stays unchanged.
"""

from __future__ import annotations

from typing import Final

# --- Profile codes (stable API / DB values) ---------------------------------

PRINT_PROFILE_LABELS = "LABELS"
PRINT_PROFILE_DOCUMENTS = "DOCUMENTS"
PRINT_PROFILE_SHIPPING_LABELS = "SHIPPING_LABELS"
PRINT_PROFILE_REPORTS = "REPORTS"

PRINT_PROFILES: Final[tuple[str, ...]] = (
    PRINT_PROFILE_LABELS,
    PRINT_PROFILE_DOCUMENTS,
    PRINT_PROFILE_SHIPPING_LABELS,
    PRINT_PROFILE_REPORTS,
)

PRINT_PROFILE_LABELS_PL: Final[dict[str, str]] = {
    PRINT_PROFILE_LABELS: "Etykiety",
    PRINT_PROFILE_DOCUMENTS: "Dokumenty",
    PRINT_PROFILE_SHIPPING_LABELS: "Listy przewozowe",
    PRINT_PROFILE_REPORTS: "Raporty",
}

PRINT_PROFILE_ICONS: Final[dict[str, str]] = {
    PRINT_PROFILE_LABELS: "🏷️",
    PRINT_PROFILE_DOCUMENTS: "📄",
    PRINT_PROFILE_SHIPPING_LABELS: "🚚",
    PRINT_PROFILE_REPORTS: "📊",
}

# Preferred order when collapsing legacy invoice/order/other → DOCUMENTS
_DOCUMENTS_LEGACY_PRIORITY: Final[tuple[str, ...]] = ("invoice", "order", "other")

# Legacy workstation print_type → profile (data migration)
LEGACY_PRINT_TYPE_TO_PROFILE: Final[dict[str, str]] = {
    "labels": PRINT_PROFILE_LABELS,
    "shipping_label": PRINT_PROFILE_SHIPPING_LABELS,
    "invoice": PRINT_PROFILE_DOCUMENTS,
    "order": PRINT_PROFILE_DOCUMENTS,
    "other": PRINT_PROFILE_DOCUMENTS,
    # Already-migrated / alias forms
    "LABELS": PRINT_PROFILE_LABELS,
    "DOCUMENTS": PRINT_PROFILE_DOCUMENTS,
    "SHIPPING_LABELS": PRINT_PROFILE_SHIPPING_LABELS,
    "REPORTS": PRINT_PROFILE_REPORTS,
    "label": PRINT_PROFILE_LABELS,
    "a4": PRINT_PROFILE_DOCUMENTS,
    "receipt": PRINT_PROFILE_DOCUMENTS,
}

# Warehouse PrintingDefault.printer_type → profile
LEGACY_PRINTER_TYPE_TO_PROFILE: Final[dict[str, str]] = {
    "label": PRINT_PROFILE_LABELS,
    "a4": PRINT_PROFILE_DOCUMENTS,
    "receipt": PRINT_PROFILE_DOCUMENTS,
    "other": PRINT_PROFILE_DOCUMENTS,
}


def is_print_profile(value: str | None) -> bool:
    return bool(value) and str(value).strip().upper() in PRINT_PROFILES


def normalize_print_profile(value: str | None) -> str | None:
    """Accept profile code or legacy print_type; return canonical profile or None."""
    if value is None:
        return None
    raw = str(value).strip()
    if not raw:
        return None
    upper = raw.upper()
    if upper in PRINT_PROFILES:
        return upper
    return LEGACY_PRINT_TYPE_TO_PROFILE.get(raw) or LEGACY_PRINT_TYPE_TO_PROFILE.get(raw.lower())


def documents_legacy_priority_index(legacy_print_type: str) -> int:
    try:
        return _DOCUMENTS_LEGACY_PRIORITY.index(legacy_print_type)
    except ValueError:
        return 99
