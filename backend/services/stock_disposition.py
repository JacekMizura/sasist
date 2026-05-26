"""Warehouse stock quality / disposition — persisted on lines, operations, and inventory (not RMZ-view-only)."""

from __future__ import annotations

from typing import Any

# Canonical codes (uppercase). Extend when adding outlet/service/quarantine flows from office config.
STOCK_DISPOSITION_SALEABLE = "SALEABLE"
STOCK_DISPOSITION_OUTLET_B = "OUTLET_B"
STOCK_DISPOSITION_SERVICE_C = "SERVICE_C"
STOCK_DISPOSITION_REJECTED_STOCK = "REJECTED_STOCK"
STOCK_DISPOSITION_QUARANTINE = "QUARANTINE"
STOCK_DISPOSITION_SCRAP = "SCRAP"

DEFAULT_STOCK_DISPOSITION = STOCK_DISPOSITION_SALEABLE


def normalize_stock_disposition(raw: Any | None) -> str:
    s = ("" if raw is None else str(raw)).strip().upper()
    return s if s else DEFAULT_STOCK_DISPOSITION


def stock_disposition_for_document_line(item: Any | None) -> str:
    """Prefer ``stock_disposition``; fall back to legacy ``return_disposition`` (same warehouse semantics)."""
    if item is None:
        return DEFAULT_STOCK_DISPOSITION
    sd = getattr(item, "stock_disposition", None)
    if sd is not None and str(sd).strip():
        return normalize_stock_disposition(sd)
    rd = getattr(item, "return_disposition", None)
    if rd is not None and str(rd).strip():
        return normalize_stock_disposition(rd)
    return DEFAULT_STOCK_DISPOSITION


def stock_disposition_display_badge(code: str) -> str | None:
    """Short badge for product inventory rows (e.g. OUTLET_B → [B])."""
    c = normalize_stock_disposition(code)
    if c == DEFAULT_STOCK_DISPOSITION:
        return None
    if c == STOCK_DISPOSITION_OUTLET_B:
        return "[B]"
    if c == STOCK_DISPOSITION_SERVICE_C:
        return "[C]"
    if c == STOCK_DISPOSITION_REJECTED_STOCK:
        return "[X]"
    if c == STOCK_DISPOSITION_QUARANTINE:
        return "[Q]"
    if c == STOCK_DISPOSITION_SCRAP:
        return "[S]"
    return f"[{c[:8]}]"
