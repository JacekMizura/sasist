"""
Pick-eligible inventory filter — DOCK-IN is physical only when warehouse.requires_putaway.

SSOT for ATP / picking / production allocation location eligibility.
"""

from __future__ import annotations

from typing import Optional

from ..models.location import Location
from ..models.warehouse import Warehouse

NON_PICK_ELIGIBLE_LOCATION_TYPES = frozenset({"PICK_START", "PACKING", "DOCK"})

SYSTEM_DOCK_IN_NAME = "DOCK-IN"
SYSTEM_STOCK_NAME = "STOCK"


def warehouse_requires_putaway(warehouse: Warehouse | None) -> bool:
    if warehouse is None:
        return True
    raw = getattr(warehouse, "requires_putaway", True)
    if raw is None:
        return True
    return bool(raw)


def is_pick_eligible_location(
    *,
    requires_putaway: bool,
    location_type: str | None,
    location_name: str | None = None,
) -> bool:
    """
    When ``requires_putaway`` is True, DOCK locations are excluded from pick/ATP.
    PICK_START and PACKING are always non-pick-eligible.
    """
    lt = (location_type or "").strip().upper()
    if lt in ("PICK_START", "PACKING"):
        return False
    if lt == "DOCK" and requires_putaway:
        return False
    return True


def is_pick_eligible_location_row(
    location: Location | None,
    *,
    requires_putaway: bool,
) -> bool:
    if location is None:
        return False
    return is_pick_eligible_location(
        requires_putaway=requires_putaway,
        location_type=getattr(location, "location_type", None),
        location_name=getattr(location, "name", None),
    )


def load_warehouse_requires_putaway_map(
    db,
    warehouse_ids: set[int],
) -> dict[int, bool]:
    if not warehouse_ids:
        return {}
    rows = (
        db.query(Warehouse.id, Warehouse.requires_putaway)
        .filter(Warehouse.id.in_(tuple(int(x) for x in warehouse_ids)))
        .all()
    )
    out: dict[int, bool] = {}
    for wid, flag in rows:
        out[int(wid)] = bool(flag) if flag is not None else True
    return out


def resolve_requires_putaway_for_warehouse(db, warehouse_id: Optional[int]) -> bool:
    if warehouse_id is None:
        return True
    try:
        row = db.query(Warehouse.requires_putaway).filter(Warehouse.id == int(warehouse_id)).first()
    except Exception:
        return True
    if row is None:
        return True
    flag = row[0]
    return bool(flag) if flag is not None else True
