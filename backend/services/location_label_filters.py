"""Filter location label records by floor before PDF/layout (not in template or render)."""

from __future__ import annotations

from typing import Any

from .location_label_parse import parse_location


def _norm_floor_token(s: str) -> str:
    return (s or "").strip().upper()


def record_effective_floor(record: dict[str, Any]) -> str | None:
    """
    Floor segment for exclusion: use record['floor'] if set, else parse from loc_name / location_name / location_code.
    """
    raw = record.get("floor")
    if raw is not None and str(raw).strip() != "":
        return _norm_floor_token(str(raw))
    loc = (
        str(record.get("loc_name") or "").strip()
        or str(record.get("location_name") or "").strip()
        or str(record.get("location_code") or "").strip()
    )
    parsed = parse_location(loc)
    if not parsed:
        return None
    return _norm_floor_token(parsed["floor"])


def apply_label_filters(records: list[dict[str, Any]], exclude_floors: list[str] | None = None) -> list[dict[str, Any]]:
    """
    Shared pre-render filters for label records (layout API, CSV / POST render-pdf, etc.).
    Currently: drop rows whose effective floor is in exclude_floors (uses record['floor'] or parse from loc_name).
    """
    if not records:
        return []
    ex = {_norm_floor_token(x) for x in (exclude_floors or []) if x is not None and str(x).strip() != ""}
    if not ex:
        return list(records)
    out: list[dict[str, Any]] = []
    for r in records:
        if not isinstance(r, dict):
            continue
        fl = record_effective_floor(r)
        if fl is not None and fl in ex:
            continue
        out.append(r)
    return out


def filter_records_exclude_floors(records: list[dict[str, Any]], exclude_floors: list[str] | None) -> list[dict[str, Any]]:
    """Alias for :func:`apply_label_filters` (floor exclusion only)."""
    return apply_label_filters(records, exclude_floors)
