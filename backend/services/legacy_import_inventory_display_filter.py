"""
Hide legacy junk locations/stock from product catalog APIs.

Product CSV import used to create ``Location`` + ``Inventory`` rows (e.g. mis-mapped
\"179 szt.\" as a location name, or auto-created PRZYJĘCIE floor stubs without layout UUID).

Import no longer writes inventory; this filter hides existing bad rows in list/detail payloads.
Receiving and real bins typically set ``Location.location_uuid`` — those are never hidden.
"""

from __future__ import annotations

import re

from .default_receiving_location import receiving_name_candidates

_SZT_GARBAGE = re.compile(r"^\d+([,.]\d+)?\s*szt\.?\s*$", re.IGNORECASE)
_RESERVED_NAMES = frozenset({"import", "default", "unknown"})


def should_hide_legacy_csv_import_inventory_location(
    *,
    loc_name: str,
    loc_type: str | None = None,
    location_type: str | None = None,
    location_uuid: str | None = None,
) -> bool:
    """
    True when this inventory row should be omitted from product ``locations`` / ``inventory``
    API fields (not deleted in DB).
    """
    name = (loc_name or "").strip()
    if not name:
        return False
    if (location_uuid or "").strip():
        return False

    n = name.casefold()
    if n in _RESERVED_NAMES:
        return True
    if _SZT_GARBAGE.match(name):
        return True

    t = (loc_type or "").strip().lower()
    lt = (location_type or "NORMAL").strip().upper()
    if t == "floor" and lt == "NORMAL":
        candidates = {x.casefold() for x in receiving_name_candidates()}
        if n in candidates:
            return True
    return False
