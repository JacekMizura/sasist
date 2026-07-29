"""SSOT: document / queue type → print profile.

Add new document types here only — never scatter if/elif across the codebase.
"""

from __future__ import annotations

from typing import Final

from .profiles import (
    PRINT_PROFILE_DOCUMENTS,
    PRINT_PROFILE_LABELS,
    PRINT_PROFILE_REPORTS,
    PRINT_PROFILE_SHIPPING_LABELS,
    normalize_print_profile,
)

# ---------------------------------------------------------------------------
# Document / queue document_type → profile
# Keys are lowercase. Unknown types fall back to DOCUMENTS (safe default for PDF).
# ---------------------------------------------------------------------------

DOCUMENT_TYPE_TO_PRINT_PROFILE: Final[dict[str, str]] = {
    # --- Labels -----------------------------------------------------------
    "label": PRINT_PROFILE_LABELS,
    "labels": PRINT_PROFILE_LABELS,
    "location_label": PRINT_PROFILE_LABELS,
    "product_label": PRINT_PROFILE_LABELS,
    "basket_label": PRINT_PROFILE_LABELS,
    "cart_label": PRINT_PROFILE_LABELS,
    "sscc_label": PRINT_PROFILE_LABELS,
    "pallet_label": PRINT_PROFILE_LABELS,
    "carton_label": PRINT_PROFILE_LABELS,
    "bin_label": PRINT_PROFILE_LABELS,
    # --- Shipping carrier labels ------------------------------------------
    "shipping_label": PRINT_PROFILE_SHIPPING_LABELS,
    "carrier_label": PRINT_PROFILE_SHIPPING_LABELS,
    "inpost_label": PRINT_PROFILE_SHIPPING_LABELS,
    "dpd_label": PRINT_PROFILE_SHIPPING_LABELS,
    "dhl_label": PRINT_PROFILE_SHIPPING_LABELS,
    "gls_label": PRINT_PROFILE_SHIPPING_LABELS,
    "fedex_label": PRINT_PROFILE_SHIPPING_LABELS,
    "ups_label": PRINT_PROFILE_SHIPPING_LABELS,
    "orlen_label": PRINT_PROFILE_SHIPPING_LABELS,
    "poczta_polska_label": PRINT_PROFILE_SHIPPING_LABELS,
    # --- Standard PDF documents -------------------------------------------
    "sale_document": PRINT_PROFILE_DOCUMENTS,
    "stock_document": PRINT_PROFILE_DOCUMENTS,
    "invoice": PRINT_PROFILE_DOCUMENTS,
    "receipt": PRINT_PROFILE_DOCUMENTS,
    "correction": PRINT_PROFILE_DOCUMENTS,
    "order": PRINT_PROFILE_DOCUMENTS,
    "order_confirmation": PRINT_PROFILE_DOCUMENTS,
    "picking_list": PRINT_PROFILE_DOCUMENTS,
    "wz": PRINT_PROFILE_DOCUMENTS,
    "pz": PRINT_PROFILE_DOCUMENTS,
    "pw": PRINT_PROFILE_DOCUMENTS,
    "rw": PRINT_PROFILE_DOCUMENTS,
    "mm": PRINT_PROFILE_DOCUMENTS,
    "warehouse_wz": PRINT_PROFILE_DOCUMENTS,
    "warehouse_pz": PRINT_PROFILE_DOCUMENTS,
    "warehouse_pw": PRINT_PROFILE_DOCUMENTS,
    "warehouse_rw": PRINT_PROFILE_DOCUMENTS,
    "warehouse_mm": PRINT_PROFILE_DOCUMENTS,
    "inventory_count": PRINT_PROFILE_DOCUMENTS,
    "stock_transfer": PRINT_PROFILE_DOCUMENTS,
    "relocation_document": PRINT_PROFILE_DOCUMENTS,
    "production_batch_card": PRINT_PROFILE_DOCUMENTS,
    "production_order_card": PRINT_PROFILE_DOCUMENTS,
    "production_card": PRINT_PROFILE_DOCUMENTS,
    "return_document": PRINT_PROFILE_DOCUMENTS,
    "complaint_document": PRINT_PROFILE_DOCUMENTS,
    "supplier_order": PRINT_PROFILE_DOCUMENTS,
    "product_card": PRINT_PROFILE_DOCUMENTS,
    # --- Reports / analytics / exports ------------------------------------
    "report": PRINT_PROFILE_REPORTS,
    "reports": PRINT_PROFILE_REPORTS,
    "inventory_report": PRINT_PROFILE_REPORTS,
    "production_report": PRINT_PROFILE_REPORTS,
    "quality_report": PRINT_PROFILE_REPORTS,
    "analytics_report": PRINT_PROFILE_REPORTS,
    "export_pdf": PRINT_PROFILE_REPORTS,
    "pdf_export": PRINT_PROFILE_REPORTS,
}

# PrintMethodDialog / capability kind → candidate profiles (first mapped wins)
KIND_TO_PRINT_PROFILES: Final[dict[str, tuple[str, ...]]] = {
    "label": (PRINT_PROFILE_LABELS, PRINT_PROFILE_SHIPPING_LABELS),
    "labels": (PRINT_PROFILE_LABELS, PRINT_PROFILE_SHIPPING_LABELS),
    "receipt": (PRINT_PROFILE_DOCUMENTS,),
    "receipts": (PRINT_PROFILE_DOCUMENTS,),
    "paragon": (PRINT_PROFILE_DOCUMENTS,),
    "a4": (PRINT_PROFILE_DOCUMENTS, PRINT_PROFILE_REPORTS),
    "report": (PRINT_PROFILE_REPORTS, PRINT_PROFILE_DOCUMENTS),
    "reports": (PRINT_PROFILE_REPORTS, PRINT_PROFILE_DOCUMENTS),
    "shipping": (PRINT_PROFILE_SHIPPING_LABELS,),
}


def document_type_to_print_profile(document_type: str | None) -> str:
    key = (document_type or "").strip().lower()
    if not key:
        return PRINT_PROFILE_DOCUMENTS
    if key in DOCUMENT_TYPE_TO_PRINT_PROFILE:
        return DOCUMENT_TYPE_TO_PRINT_PROFILE[key]
    # Already a profile code?
    normalized = normalize_print_profile(key)
    if normalized:
        return normalized
    return PRINT_PROFILE_DOCUMENTS


def kind_to_print_profiles(kind: str | None) -> tuple[str, ...]:
    key = (kind or "a4").strip().lower()
    return KIND_TO_PRINT_PROFILES.get(key, KIND_TO_PRINT_PROFILES["a4"])
