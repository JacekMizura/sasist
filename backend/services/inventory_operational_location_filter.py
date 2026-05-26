"""
Filtr widoku „Stan magazynowy”: ukrywa strefy techniczne / bufor przyjęcia w API listy.

Dane w ``inventory`` pozostają (przyjęcia, PZ, rezerwacje); zmienia się tylko domyślna lista GET /inventory/.
Tryb diagnostyczny (``inventory_debug=true``) pokazuje wszystkie wiersze.
"""

from __future__ import annotations

import re
import unicodedata

from ..models.location import Location
from .legacy_import_inventory_display_filter import should_hide_legacy_csv_import_inventory_location


def _ascii_fold_upper(s: str) -> str:
    nk = unicodedata.normalize("NFKD", s)
    return "".join(c for c in nk if not unicodedata.combining(c)).upper()


_TMP_WORD = re.compile(r"(^|[^a-z0-9])tmp([^a-z0-9]|$)", re.IGNORECASE)


def is_technical_staging_location_name(name: str | None) -> bool:
    """
    Lokalizacja uznana za techniczną wg nazwy (niezależnie od UUID).

    Obejmuje typowe bufory przyjęcia z importu / get_or_create_stock_location.
    """
    raw = (name or "").strip()
    if not raw:
        return False
    cf = raw.casefold()
    u = _ascii_fold_upper(raw)

    # Dokładne krótkie etykiety systemowe
    if cf in ("tmp", "system", "buffer", "bufor", "receiving", "staging", "przyjęcie", "przyjecie"):
        return True
    if u in ("TMP", "SYSTEM", "BUFFER", "BUFOR", "RECEIVING", "STAGING", "PRZYJECIE"):
        return True

    # Słowa kluczowe w nazwie (np. „Strefa PRZYJĘCIE”, „RECEIVING-01”)
    markers_cf = (
        "przyjęcie",
        "przyjecie",
        "receiving",
        "buffer",
        "bufor",
        "staging",
    )
    for m in markers_cf:
        if m in cf:
            return True

    if _TMP_WORD.search(raw):
        return True
    return False


def exclude_location_from_operational_inventory_list(loc: Location | None) -> bool:
    """True = pomiń wiersz w domyślnym GET /inventory (nie tryb diagnostyczny)."""
    if loc is None:
        return True
    uuid = getattr(loc, "location_uuid", None)
    uuid_s = (uuid or "").strip() if isinstance(uuid, str) else None
    if should_hide_legacy_csv_import_inventory_location(
        loc_name=loc.name or "",
        loc_type=getattr(loc, "type", None),
        location_type=getattr(loc, "location_type", None),
        location_uuid=uuid_s,
    ):
        return True
    if is_technical_staging_location_name(loc.name):
        return True
    return False
