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

# Future outlet / refurb pools (Etap 3+ — not reservable in Etap 2 MVP).
STOCK_DISPOSITION_OUTLET_C = "OUTLET_C"
STOCK_DISPOSITION_REFURBISHED = "REFURBISHED"

DEFAULT_STOCK_DISPOSITION = STOCK_DISPOSITION_SALEABLE

# Order lines may reserve/pick only from these pools (Etap 2).
RESERVABLE_STOCK_DISPOSITIONS: frozenset[str] = frozenset(
    {
        STOCK_DISPOSITION_SALEABLE,
        STOCK_DISPOSITION_OUTLET_B,
    }
)


def normalize_stock_disposition(raw: Any | None) -> str:
    s = ("" if raw is None else str(raw)).strip().upper()
    return s if s else DEFAULT_STOCK_DISPOSITION


def assert_reservable_disposition(code: str) -> str:
    """Validate disposition for order line / reservation creation."""
    c = normalize_stock_disposition(code)
    if c not in RESERVABLE_STOCK_DISPOSITIONS:
        allowed = ", ".join(sorted(RESERVABLE_STOCK_DISPOSITIONS))
        raise ValueError(f"Disposition {c!r} is not reservable (allowed: {allowed}).")
    return c


def resolve_order_item_required_disposition(order_item: Any | None) -> str:
    raw = getattr(order_item, "required_stock_disposition", None) if order_item is not None else None
    return normalize_stock_disposition(raw)


def disposition_for_new_order_line(raw: Any | None = None) -> str:
    """API / import default — validates reservable pool."""
    return assert_reservable_disposition(normalize_stock_disposition(raw))


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
    """Operator-facing badge for product inventory rows (location + state)."""
    return damaged_inventory_badge_label(normalize_stock_disposition(code), None)


def damaged_inventory_badge_label(
    stock_disposition: str | None,
    damage_class: str | None = None,
) -> str | None:
    """Location badge: USZKODZONY B / USZKODZONY C / USZKODZONY / (A) / …"""
    cls = (damage_class or "").strip().upper()
    if cls in ("B", "C"):
        return f"USZKODZONY {cls}"
    c = normalize_stock_disposition(stock_disposition)
    if c == STOCK_DISPOSITION_OUTLET_B or c == STOCK_DISPOSITION_SERVICE_C:
        return "USZKODZONY"
    if c == DEFAULT_STOCK_DISPOSITION:
        return "(A)"
    if c == STOCK_DISPOSITION_REJECTED_STOCK:
        return "(ODRZUCONY)"
    if c == STOCK_DISPOSITION_QUARANTINE:
        return "(KWARANTANNA)"
    if c == STOCK_DISPOSITION_SCRAP:
        return "(ZŁOM)"
    return f"({c[:12]})"
