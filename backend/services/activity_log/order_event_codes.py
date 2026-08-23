"""Canonical Order › Logi event codes (Activity Log SSOT).

Domain tables remain detail SSOT; these codes are order-facing timeline summaries only.
"""

from __future__ import annotations

from typing import Literal

# --- Order ---
ORDER_STATUS_CHANGED = "ORDER_STATUS_CHANGED"

# --- Automation ---
AUTOMATION_SUCCEEDED = "AUTOMATION_SUCCEEDED"
AUTOMATION_FAILED = "AUTOMATION_FAILED"
AUTOMATION_BLOCKED = "AUTOMATION_BLOCKED"

# --- Sale documents ---
SALE_DOCUMENT_CREATED = "SALE_DOCUMENT_CREATED"
SALE_DOCUMENT_NUMBER_ASSIGNED = "SALE_DOCUMENT_NUMBER_ASSIGNED"
SALE_DOCUMENT_CORRECTION_CREATED = "SALE_DOCUMENT_CORRECTION_CREATED"
SALE_DOCUMENT_FAILED = "SALE_DOCUMENT_FAILED"

# --- Warehouse documents (non-WMS writers only) ---
WAREHOUSE_DOCUMENT_CREATED = "WAREHOUSE_DOCUMENT_CREATED"
WAREHOUSE_DOCUMENT_NUMBER_ASSIGNED = "WAREHOUSE_DOCUMENT_NUMBER_ASSIGNED"
WAREHOUSE_DOCUMENT_FAILED = "WAREHOUSE_DOCUMENT_FAILED"

ActorKind = Literal["USER", "SYSTEM", "AUTOMATION"]

ORDER_EVENT_CATEGORY: dict[str, str] = {
    ORDER_STATUS_CHANGED: "order",
    AUTOMATION_SUCCEEDED: "automation",
    AUTOMATION_FAILED: "automation",
    AUTOMATION_BLOCKED: "automation",
    SALE_DOCUMENT_CREATED: "documents",
    SALE_DOCUMENT_NUMBER_ASSIGNED: "documents",
    SALE_DOCUMENT_CORRECTION_CREATED: "documents",
    SALE_DOCUMENT_FAILED: "documents",
    WAREHOUSE_DOCUMENT_CREATED: "documents",
    WAREHOUSE_DOCUMENT_NUMBER_ASSIGNED: "documents",
    WAREHOUSE_DOCUMENT_FAILED: "documents",
}

ORDER_EVENT_TITLES_PL: dict[str, str] = {
    ORDER_STATUS_CHANGED: "Zmiana statusu",
    AUTOMATION_SUCCEEDED: "Automatyzacja",
    AUTOMATION_FAILED: "Automatyzacja",
    AUTOMATION_BLOCKED: "Automatyzacja",
    SALE_DOCUMENT_CREATED: "Dokument sprzedaży",
    SALE_DOCUMENT_NUMBER_ASSIGNED: "Numer dokumentu",
    SALE_DOCUMENT_CORRECTION_CREATED: "Korekta dokumentu",
    SALE_DOCUMENT_FAILED: "Dokument sprzedaży",
    WAREHOUSE_DOCUMENT_CREATED: "Dokument magazynowy",
    WAREHOUSE_DOCUMENT_NUMBER_ASSIGNED: "Numer dokumentu magazynowego",
    WAREHOUSE_DOCUMENT_FAILED: "Dokument magazynowy",
}

ORDER_EVENT_CODES: frozenset[str] = frozenset(ORDER_EVENT_CATEGORY.keys())
