"""
Rack label generator: produce label records for rack locations.

Used to generate many location labels from a rack prefix, levels, and positions.
Example: rack=A, levels=5, positions=4 -> A-1-1, A-1-2, ..., A-5-4.
"""

from typing import Any


def generate_rack_locations(
    rack_prefix: str,
    levels: int,
    positions: int,
    zone: str | None = None,
) -> list[dict[str, Any]]:
    """
    Generate a list of label records for rack locations.

    Args:
        rack_prefix: Rack identifier (e.g. "A", "B-01").
        levels: Number of levels (vertical, 1-based).
        positions: Number of positions per level (e.g. segments, 1-based).
        zone: Optional zone name to include in each record.

    Returns:
        List of dicts with loc_name, loc_barcode, level, position, barcode_data,
        and optional zone_name. Suitable for location label templates.
    """
    rack = (rack_prefix or "A").strip().upper()
    levels = max(1, int(levels))
    positions = max(1, int(positions))
    out: list[dict[str, Any]] = []
    for level in range(1, levels + 1):
        for position in range(1, positions + 1):
            loc_name = f"{rack}-{level}-{position}"
            record: dict[str, Any] = {
                "loc_name": loc_name,
                "loc_barcode": loc_name,
                "location_name": loc_name,
                "level": level,
                "position": position,
                "barcode_data": loc_name,
                "{loc_name}": loc_name,
                "{loc_barcode}": loc_name,
            }
            if zone:
                record["zone_name"] = zone
                record["{zone}"] = zone
            out.append(record)
    return out
