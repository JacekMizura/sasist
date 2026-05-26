"""Batch / expiry normalization for inventory, PZ lines, reservations, and picks."""

from __future__ import annotations

from datetime import date, datetime
from typing import Optional

# Stored on rows where expiry is not tracked (unique constraint + FEFO sorts last).
NO_EXPIRY_SENTINEL = date(9999, 12, 31)


def normalize_batch_number(raw: Optional[str]) -> str:
    if raw is None:
        return ""
    return str(raw).strip()


def parse_expiry_date(raw: Optional[object]) -> Optional[date]:
    """Parse API date (YYYY-MM-DD string or date). None / empty → None (caller maps to sentinel)."""
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw.date()
    if type(raw) is date:
        return raw
    s = str(raw).strip()
    if not s:
        return None
    try:
        y, m, d = (int(x) for x in s[:10].split("-"))
        return date(y, m, d)
    except (ValueError, TypeError):
        return None


def storage_expiry_date(track_expiry: bool, raw_expiry: Optional[object]) -> date:
    """DB value for expiry_date column."""
    if not track_expiry:
        return NO_EXPIRY_SENTINEL
    d = parse_expiry_date(raw_expiry)
    return d if d is not None else NO_EXPIRY_SENTINEL


def expiry_for_api(d: Optional[date]) -> Optional[str]:
    """Hide sentinel in JSON."""
    if d is None or d >= NO_EXPIRY_SENTINEL:
        return None
    return d.isoformat()


def dock_lot_keys_for_pz_line(row) -> tuple[str, date]:
    """
    Inventory lot keys for dock receipt and putaway transfer.
    Uses values stored on the PZ line (not product track flags) so receiving
    and putaway always match the same physical stock identity.
    """
    bn = normalize_batch_number(getattr(row, "batch_number", None))
    ed_raw = getattr(row, "expiry_date", None)
    ed = ed_raw if ed_raw is not None else NO_EXPIRY_SENTINEL
    return bn, ed
