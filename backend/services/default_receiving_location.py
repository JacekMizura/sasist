"""
Domyślna strefa przyjęcia dla stanu bez jawnej lokalizacji w CSV / legacy stock_quantity.

Zamiast tworzyć sztuczną lokalizację „Import”, używamy (w kolejności):
1) istniejącej lokalizacji z ``location_type`` DOCK lub PICK_START,
2) pierwszej nazwy z ``WMS_DEFAULT_RECEIVING_LOCATION_NAMES`` (domyślnie PRZYJĘCIE, BUFOR),
3) utworzenia pierwszej nazwy z listy jako lokalizacji ``type=floor``.
"""

from __future__ import annotations

import os

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.location import Location

_ENV_NAMES = "WMS_DEFAULT_RECEIVING_LOCATION_NAMES"


def receiving_name_candidates() -> tuple[str, ...]:
    raw = os.getenv(_ENV_NAMES, "PRZYJĘCIE,BUFOR").strip()
    parts = tuple(x.strip() for x in raw.split(",") if x.strip())
    return parts if parts else ("PRZYJĘCIE", "BUFOR")


def find_receiving_location(db: Session, warehouse_id: int) -> Location | None:
    row = (
        db.query(Location)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            Location.location_type.in_(("DOCK", "PICK_START")),
            Location.is_active.is_(True),
        )
        .order_by(Location.id)
        .first()
    )
    if row:
        return row
    for name in receiving_name_candidates():
        hit = (
            db.query(Location)
            .filter(
                Location.warehouse_id == int(warehouse_id),
                func.lower(Location.name) == name.lower(),
                Location.is_active.is_(True),
            )
            .first()
        )
        if hit:
            return hit
    return None


def get_or_create_stock_location(db: Session, warehouse_id: int, csv_location_name: str | None) -> Location | None:
    """
    Gdy ``csv_location_name`` jest niepuste — dokładnie ta nazwa (get-or-create).
    Gdy puste — strefa przyjęcia (istniejąca lub utworzona), nigdy „Import”.
    """
    stripped = (csv_location_name or "").strip()
    if stripped.casefold() == "import":
        stripped = ""
    if stripped:
        loc = (
            db.query(Location)
            .filter(Location.warehouse_id == int(warehouse_id), Location.name == stripped)
            .first()
        )
        if loc:
            return loc
        loc = Location(warehouse_id=int(warehouse_id), name=stripped, type="pick")
        db.add(loc)
        db.flush()
        return loc

    loc = find_receiving_location(db, warehouse_id)
    if loc:
        return loc

    first_name = receiving_name_candidates()[0]
    loc = Location(
        warehouse_id=int(warehouse_id),
        name=first_name,
        type="floor",
        location_type="NORMAL",
    )
    db.add(loc)
    db.flush()
    return loc
