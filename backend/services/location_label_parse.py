"""Parse location display codes (e.g. A1-C-6) for label template bindings."""

from __future__ import annotations

from typing import Any


def parse_location(loc: str) -> dict[str, str] | None:
    """
    Split hyphenated location codes into rack_name, floor (piętro), row (rząd).

    Examples:
        "A1-C-6" -> rack_name=A1, floor=C, row=6
        "AA-BB-CC-99" -> rack_name=AA-BB, floor=CC, row=99
    """
    s = (loc or "").strip()
    if not s:
        return None
    parts = [p.strip() for p in s.split("-") if p.strip()]
    if len(parts) < 3:
        return None
    if len(parts) == 3:
        return {"rack_name": parts[0], "floor": parts[1], "row": parts[2]}
    return {
        "rack_name": "-".join(parts[:-2]),
        "floor": parts[-2],
        "row": parts[-1],
    }


def inject_parsed_location_fields(record: dict[str, Any]) -> None:
    """Merge parse_location(loc) into record (floor, row, rack_name — bare keys for PDF bindings)."""
    loc = (
        str(record.get("loc_name") or "").strip()
        or str(record.get("location_name") or "").strip()
        or str(record.get("location_code") or "").strip()
    )
    parsed = parse_location(loc)
    if not parsed:
        return
    record["floor"] = parsed["floor"]
    record["row"] = parsed["row"]
    record["rack_name"] = parsed["rack_name"]
