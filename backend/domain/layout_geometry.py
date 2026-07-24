"""
Neutral layout/geometry helpers.

Pure Location / Euclidean utilities — independent of routing graph models.
"""

from __future__ import annotations

import math

from sqlalchemy.orm import Session

from ..models.location import Location


def get_special_locations_xy(
    db: Session, warehouse_id: int
) -> tuple[tuple[float, float] | None, tuple[float, float] | None]:
    """
    Return (pick_start_xy, packing_xy) in cm. Each is (x, y) or None.

    Uses Location.location_type PICK_START and PACKING only — no graph nodes.
    """
    rows = (
        db.query(Location)
        .filter(
            Location.warehouse_id == warehouse_id,
            Location.location_type.in_(["PICK_START", "PACKING"]),
        )
        .all()
    )
    pick_start = next((l for l in rows if l.location_type == "PICK_START"), None)
    packing = next((l for l in rows if l.location_type == "PACKING"), None)
    start_xy = (float(pick_start.x or 0), float(pick_start.y or 0)) if pick_start else None
    pack_xy = (float(packing.x or 0), float(packing.y or 0)) if packing else None
    return start_xy, pack_xy


def distance_point_to_point_cm(x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in cm (e.g. slotting distance to packing)."""
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
