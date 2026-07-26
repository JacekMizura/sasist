"""
Neutral layout/geometry helpers.

Pure Location / Euclidean utilities — independent of routing graph models.
Special map markers (START / PACKING / DOCK) come from warehouse_special_placements.
"""

from __future__ import annotations

import math

from sqlalchemy.orm import Session


def get_special_locations_xy(
    db: Session, warehouse_id: int
) -> tuple[tuple[float, float] | None, tuple[float, float] | None]:
    """
    Return (pick_start_xy, packing_xy) in cm. Each is (x, y) or None.

    Reads warehouse_special_placements — not locations.x/y.
    """
    from ..services.special_placement_service import get_special_placements_xy

    start_xy, pack_xy, _dock = get_special_placements_xy(db, warehouse_id)
    return start_xy, pack_xy


def distance_point_to_point_cm(x1: float, y1: float, x2: float, y2: float) -> float:
    """Euclidean distance in cm (e.g. slotting distance to packing)."""
    return math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2)
