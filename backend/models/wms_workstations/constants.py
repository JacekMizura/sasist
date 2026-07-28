"""WMS workstations — station types, print types, event kinds."""

from __future__ import annotations

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

# Business print types (UI) — mapped onto agent printers at the workstation.
PRINT_TYPE_SHIPPING_LABEL = "shipping_label"
PRINT_TYPE_INVOICE = "invoice"
PRINT_TYPE_LABELS = "labels"
PRINT_TYPE_ORDER = "order"
PRINT_TYPE_OTHER = "other"

PRINT_TYPES = (
    PRINT_TYPE_SHIPPING_LABEL,
    PRINT_TYPE_INVOICE,
    PRINT_TYPE_LABELS,
    PRINT_TYPE_ORDER,
    PRINT_TYPE_OTHER,
)

PRINT_TYPE_LABELS_PL: dict[str, str] = {
    PRINT_TYPE_SHIPPING_LABEL: "Lista przewozowa",
    PRINT_TYPE_INVOICE: "Faktury",
    PRINT_TYPE_LABELS: "Etykiety",
    PRINT_TYPE_ORDER: "Zamówienie",
    PRINT_TYPE_OTHER: "Pozostałe dokumenty",
}

# Legacy PrintingDefault.printer_type → workstation print_type
LEGACY_PRINTER_TYPE_TO_PRINT_TYPE: dict[str, str] = {
    "label": PRINT_TYPE_LABELS,
    "a4": PRINT_TYPE_INVOICE,
    "receipt": PRINT_TYPE_OTHER,
    "other": PRINT_TYPE_OTHER,
}

EVENT_CREATED = "created"
EVENT_UPDATED = "updated"
EVENT_COMPUTER_CONNECTED = "computer_connected"
EVENT_COMPUTER_DISCONNECTED = "computer_disconnected"
EVENT_PAIRING_CODE_ISSUED = "pairing_code_issued"
EVENT_PRINTER_MAPPING_CHANGED = "printer_mapping_changed"

PAIRING_CODE_TTL_MINUTES = 15
PAIRING_CODE_PATTERN = r"^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$"
