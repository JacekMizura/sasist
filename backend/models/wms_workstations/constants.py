"""WMS workstations — station types, legacy print types, event kinds.

Print-profile SSOT lives in ``backend.printing_profiles``. Legacy PRINT_TYPE_*
codes remain for migration / older tests only.
"""

from __future__ import annotations

from ...printing_profiles import (
    LEGACY_PRINTER_TYPE_TO_PROFILE,
    PRINT_PROFILE_DOCUMENTS,
    PRINT_PROFILE_LABELS,
    PRINT_PROFILE_LABELS_PL,
    PRINT_PROFILE_REPORTS,
    PRINT_PROFILE_SHIPPING_LABELS,
    PRINT_PROFILES,
)

STATION_TYPE_PICKING = "picking"
STATION_TYPE_PACKING = "packing"
STATION_TYPE_RECEIVING = "receiving"
STATION_TYPE_RETURNS = "returns"
STATION_TYPE_PRODUCTION = "production"
STATION_TYPE_QC = "qc"
STATION_TYPE_SHIPPING = "shipping"
STATION_TYPE_OTHER = "other"

STATION_TYPES = (
    STATION_TYPE_PICKING,
    STATION_TYPE_PACKING,
    STATION_TYPE_RECEIVING,
    STATION_TYPE_RETURNS,
    STATION_TYPE_PRODUCTION,
    STATION_TYPE_QC,
    STATION_TYPE_SHIPPING,
    STATION_TYPE_OTHER,
)

STATION_TYPE_LABELS_PL: dict[str, str] = {
    STATION_TYPE_PICKING: "Kompletacja",
    STATION_TYPE_PACKING: "Pakowanie",
    STATION_TYPE_RECEIVING: "Przyjęcia",
    STATION_TYPE_RETURNS: "Zwroty",
    STATION_TYPE_PRODUCTION: "Produkcja",
    STATION_TYPE_QC: "Kontrola jakości",
    STATION_TYPE_SHIPPING: "Wysyłka",
    STATION_TYPE_OTHER: "Inne",
}

# --- Print profiles (preferred) ---------------------------------------------
PRINT_TYPES = PRINT_PROFILES
PRINT_TYPE_LABELS_PL = PRINT_PROFILE_LABELS_PL

# Canonical profile codes (aliases for older imports)
PRINT_TYPE_LABELS = PRINT_PROFILE_LABELS
PRINT_TYPE_DOCUMENTS = PRINT_PROFILE_DOCUMENTS
PRINT_TYPE_SHIPPING_LABEL = PRINT_PROFILE_SHIPPING_LABELS
PRINT_TYPE_REPORTS = PRINT_PROFILE_REPORTS
# Legacy document buckets collapsed into DOCUMENTS
PRINT_TYPE_INVOICE = PRINT_PROFILE_DOCUMENTS
PRINT_TYPE_ORDER = PRINT_PROFILE_DOCUMENTS
PRINT_TYPE_OTHER = PRINT_PROFILE_DOCUMENTS

# Legacy PrintingDefault.printer_type → workstation print profile
LEGACY_PRINTER_TYPE_TO_PRINT_TYPE = LEGACY_PRINTER_TYPE_TO_PROFILE

EVENT_CREATED = "created"
EVENT_UPDATED = "updated"
EVENT_COMPUTER_CONNECTED = "computer_connected"
EVENT_COMPUTER_DISCONNECTED = "computer_disconnected"
EVENT_PAIRING_CODE_ISSUED = "pairing_code_issued"
EVENT_PRINTER_MAPPING_CHANGED = "printer_mapping_changed"

PAIRING_CODE_TTL_MINUTES = 15
PAIRING_CODE_PATTERN = r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$"
