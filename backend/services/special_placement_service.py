"""
Special map placements (START / PACKING / DOCK).

locations = operational identity (documents, inventory, ATP).
warehouse_special_placements = presence on the warehouse map.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.warehouse_special_placement import (
    SPECIAL_PLACEMENT_ROLES,
    WarehouseSpecialPlacement,
)

SpecialRole = Literal["PICK_START", "PACKING", "DOCK"]

_ROLE_NAMES: dict[str, str] = {
    "PICK_START": "START",
    "PACKING": "PACK",
    "DOCK": "DOCK",
}


def _role_key(role: str) -> str:
    return str(role or "").strip().upper()


def list_special_placements_payload(db: Session, warehouse_id: int) -> dict[str, dict | None]:
    """API shape: { pick_start|packing|dock: { id, x, y, location_id } | null }."""
    rows = (
        db.query(WarehouseSpecialPlacement)
        .filter(WarehouseSpecialPlacement.warehouse_id == int(warehouse_id))
        .all()
    )
    out: dict[str, dict | None] = {"pick_start": None, "packing": None, "dock": None}
    for p in rows:
        role = _role_key(p.role)
        d = {
            "id": int(p.id),
            "x": float(p.x_cm or 0),
            "y": float(p.y_cm or 0),
            "location_id": int(p.location_id) if p.location_id is not None else None,
        }
        if role == "PICK_START":
            out["pick_start"] = d
        elif role == "PACKING":
            out["packing"] = d
        elif role == "DOCK":
            out["dock"] = d
    return out


def get_special_placements_xy(
    db: Session, warehouse_id: int
) -> tuple[tuple[float, float] | None, tuple[float, float] | None, tuple[float, float] | None]:
    """Return (pick_start_xy, packing_xy, dock_xy) in cm from placements — not locations."""
    rows = (
        db.query(WarehouseSpecialPlacement)
        .filter(
            WarehouseSpecialPlacement.warehouse_id == int(warehouse_id),
            WarehouseSpecialPlacement.role.in_(list(SPECIAL_PLACEMENT_ROLES)),
        )
        .all()
    )
    start = packing = dock = None
    for p in rows:
        xy = (float(p.x_cm or 0), float(p.y_cm or 0))
        role = _role_key(p.role)
        if role == "PICK_START":
            start = xy
        elif role == "PACKING":
            packing = xy
        elif role == "DOCK":
            dock = xy
    return start, packing, dock


def _find_or_create_operational_location(
    db: Session, warehouse_id: int, role: SpecialRole
) -> Location:
    """Reuse existing operational Location for this role; create if missing. Never sets map x/y."""
    preferred_name = _ROLE_NAMES[role]
    existing = (
        db.query(Location)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            Location.location_type == role,
            Location.name == preferred_name,
        )
        .order_by(Location.id.asc())
        .first()
    )
    if existing is None:
        existing = (
            db.query(Location)
            .filter(
                Location.warehouse_id == int(warehouse_id),
                Location.location_type == role,
            )
            .order_by(Location.id.asc())
            .first()
        )
    if existing is not None:
        return existing
    loc = Location(
        warehouse_id=int(warehouse_id),
        name=preferred_name,
        type="pick" if role != "DOCK" else "floor",
        location_type=role,
        x=None,
        y=None,
        z=None,
        is_active=True,
    )
    db.add(loc)
    db.flush()
    return loc


def upsert_special_placement(
    db: Session,
    *,
    warehouse_id: int,
    role: SpecialRole,
    x_cm: float,
    y_cm: float,
    rotation: float = 0.0,
) -> WarehouseSpecialPlacement:
    """Create or update map placement for role. Does not delete locations."""
    role_u = _role_key(role)
    if role_u not in SPECIAL_PLACEMENT_ROLES:
        raise ValueError(f"Invalid special placement role: {role}")

    placement = (
        db.query(WarehouseSpecialPlacement)
        .filter(
            WarehouseSpecialPlacement.warehouse_id == int(warehouse_id),
            WarehouseSpecialPlacement.role == role_u,
        )
        .first()
    )
    loc = _find_or_create_operational_location(db, int(warehouse_id), role_u)  # type: ignore[arg-type]
    now = datetime.utcnow()
    if placement is None:
        placement = WarehouseSpecialPlacement(
            warehouse_id=int(warehouse_id),
            role=role_u,
            x_cm=float(x_cm),
            y_cm=float(y_cm),
            rotation=float(rotation or 0),
            location_id=int(loc.id),
            created_at=now,
            updated_at=now,
        )
        db.add(placement)
    else:
        placement.x_cm = float(x_cm)
        placement.y_cm = float(y_cm)
        placement.rotation = float(rotation or 0)
        if placement.location_id is None:
            placement.location_id = int(loc.id)
        placement.updated_at = now
    db.commit()
    db.refresh(placement)
    return placement


def update_special_placement_coords(
    db: Session,
    placement_id: int,
    *,
    x_cm: float,
    y_cm: float,
    rotation: float | None = None,
) -> WarehouseSpecialPlacement | None:
    placement = (
        db.query(WarehouseSpecialPlacement)
        .filter(WarehouseSpecialPlacement.id == int(placement_id))
        .first()
    )
    if placement is None:
        return None
    placement.x_cm = float(x_cm)
    placement.y_cm = float(y_cm)
    if rotation is not None:
        placement.rotation = float(rotation)
    placement.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(placement)
    return placement


def delete_special_placement(db: Session, placement_id: int) -> bool:
    """Remove map marker only — never deletes the linked locations row."""
    placement = (
        db.query(WarehouseSpecialPlacement)
        .filter(WarehouseSpecialPlacement.id == int(placement_id))
        .first()
    )
    if placement is None:
        return False
    db.delete(placement)
    db.commit()
    return True


def placement_to_dict(placement: WarehouseSpecialPlacement) -> dict[str, Any]:
    return {
        "id": int(placement.id),
        "x": float(placement.x_cm or 0),
        "y": float(placement.y_cm or 0),
        "rotation": float(placement.rotation or 0),
        "role": str(placement.role),
        "location_id": int(placement.location_id) if placement.location_id is not None else None,
        "warehouse_id": int(placement.warehouse_id),
    }
