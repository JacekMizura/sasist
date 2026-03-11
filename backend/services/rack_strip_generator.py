"""
Rack strip generator: produce segment records for a single rack beam (one level, position range).

Used to generate one long strip label with multiple location segments, e.g.:
| A-1-1 | A-1-2 | A-1-3 | A-1-4 | ... (barcode under each).
"""

from typing import Any


def generate_rack_strip(
    rack_prefix: str,
    level: int,
    start_position: int,
    end_position: int,
) -> list[dict[str, Any]]:
    """
    Generate a list of segment records for one rack strip (one level, positions start..end).

    Args:
        rack_prefix: Rack identifier (e.g. "A", "B-01").
        level: Level number (1-based).
        start_position: First position (1-based, inclusive).
        end_position: Last position (1-based, inclusive).

    Returns:
        List of dicts with loc_name, loc_barcode, barcode_data per segment.
        Suitable for repeater templates with dataset "locations".
    """
    rack = (rack_prefix or "A").strip().upper()
    level = max(1, int(level))
    start_pos = max(1, int(start_position))
    end_pos = max(start_pos, int(end_position))
    out: list[dict[str, Any]] = []
    for pos in range(start_pos, end_pos + 1):
        loc_name = f"{rack}-{level}-{pos}"
        record: dict[str, Any] = {
            "loc_name": loc_name,
            "loc_barcode": loc_name,
            "location_name": loc_name,
            "barcode_data": loc_name,
            "{loc_name}": loc_name,
            "{loc_barcode}": loc_name,
        }
        out.append(record)
    return out
