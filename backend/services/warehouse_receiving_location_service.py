"""
System receiving locations per warehouse profile (P2.5C).

requires_putaway=True  → DOCK-IN (location_type=DOCK, non pick-eligible)
requires_putaway=False → STOCK (type=pick, pick-eligible)
"""

from __future__ import annotations

import logging

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.warehouse import Warehouse
from .pick_eligible_inventory_service import (
    SYSTEM_DOCK_IN_NAME,
    SYSTEM_STOCK_NAME,
    warehouse_requires_putaway,
)

_logger = logging.getLogger(__name__)


def _find_active_dock(db: Session, warehouse_id: int) -> Location | None:
    by_type = (
        db.query(Location)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            Location.is_active.is_(True),
            Location.location_type == "DOCK",
        )
        .order_by(Location.id.asc())
        .first()
    )
    if by_type is not None:
        return by_type
    return (
        db.query(Location)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            Location.is_active.is_(True),
            func.lower(Location.name) == SYSTEM_DOCK_IN_NAME.lower(),
        )
        .order_by(Location.id.asc())
        .first()
    )


def _find_active_stock(db: Session, warehouse_id: int) -> Location | None:
    return (
        db.query(Location)
        .filter(
            Location.warehouse_id == int(warehouse_id),
            Location.is_active.is_(True),
            func.lower(Location.name) == SYSTEM_STOCK_NAME.lower(),
        )
        .order_by(Location.id.asc())
        .first()
    )


def ensure_dock_in_location(db: Session, warehouse_id: int) -> Location:
    existing = _find_active_dock(db, warehouse_id)
    if existing is not None:
        changed = False
        if (existing.location_type or "").upper() != "DOCK":
            existing.location_type = "DOCK"
            changed = True
        if (existing.name or "").strip().upper() != SYSTEM_DOCK_IN_NAME:
            existing.name = SYSTEM_DOCK_IN_NAME
            changed = True
        if (existing.type or "").lower() != "floor":
            existing.type = "floor"
            changed = True
        if changed:
            db.flush()
        return existing

    loc = Location(
        warehouse_id=int(warehouse_id),
        name=SYSTEM_DOCK_IN_NAME,
        type="floor",
        location_type="DOCK",
        is_active=True,
    )
    db.add(loc)
    db.flush()
    _logger.info("provisioned DOCK-IN warehouse_id=%s location_id=%s", warehouse_id, loc.id)
    return loc


def ensure_stock_location(db: Session, warehouse_id: int) -> Location:
    existing = _find_active_stock(db, warehouse_id)
    if existing is not None:
        changed = False
        if (existing.type or "").lower() != "pick":
            existing.type = "pick"
            changed = True
        if (existing.location_type or "").upper() != "NORMAL":
            existing.location_type = "NORMAL"
            changed = True
        if changed:
            db.flush()
        return existing

    loc = Location(
        warehouse_id=int(warehouse_id),
        name=SYSTEM_STOCK_NAME,
        type="pick",
        location_type="NORMAL",
        is_active=True,
    )
    db.add(loc)
    db.flush()
    _logger.info("provisioned STOCK warehouse_id=%s location_id=%s", warehouse_id, loc.id)
    return loc


def ensure_warehouse_system_receiving_location(db: Session, warehouse_id: int) -> Location:
    wh = db.query(Warehouse).filter(Warehouse.id == int(warehouse_id)).first()
    if wh is None:
        raise ValueError(f"Magazyn #{warehouse_id} nie istnieje")
    if warehouse_requires_putaway(wh):
        return ensure_dock_in_location(db, int(warehouse_id))
    return ensure_stock_location(db, int(warehouse_id))


def ensure_receiving_location_for_pz_document(db: Session, doc) -> Location:
    wh_id = getattr(doc, "warehouse_id", None)
    if wh_id is None:
        raise ValueError("PZ wymaga warehouse_id")
    return ensure_warehouse_system_receiving_location(db, int(wh_id))


def backfill_warehouse_system_receiving_locations(db: Session) -> int:
    """Idempotent startup backfill — returns count of warehouses processed."""
    rows = db.query(Warehouse.id).order_by(Warehouse.id.asc()).all()
    count = 0
    for (wid,) in rows:
        try:
            ensure_warehouse_system_receiving_location(db, int(wid))
            count += 1
        except Exception:
            _logger.exception("backfill system receiving location failed warehouse_id=%s", wid)
    db.commit()
    return count
