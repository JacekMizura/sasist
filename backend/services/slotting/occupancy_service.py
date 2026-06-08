"""Location occupancy aggregation and persistence."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.location import Location
from ...models.product import Product
from .capacity_service import cm3_to_dm3, location_volume_capacity_dm3, product_footprint_from_orm
from .slotting_models import CAPACITY_EMPTY, CAPACITY_FULL, CAPACITY_HIGH, CAPACITY_LOW, CAPACITY_MEDIUM, CAPACITY_OVERFLOW, PACKAGING_UNIT
from .errors import LocationNotFoundError

logger = logging.getLogger(__name__)


def load_product_footprints_bulk(db: Session, product_ids: list[int]) -> dict[int, Any]:
    if not product_ids:
        return {}
    rows = db.query(Product).filter(Product.id.in_(list(set(product_ids)))).all()
    return {int(p.id): product_footprint_from_orm(p, packaging_mode=PACKAGING_UNIT) for p in rows}


def aggregate_location_occupancy_from_inventory(
    db: Session,
    *,
    location_id: int,
) -> tuple[float, float]:
    """Sum volume/weight from inventory rows at location — single grouped query."""
    rows = (
        db.query(
            Inventory.product_id,
            func.coalesce(func.sum(Inventory.quantity), 0.0),
        )
        .filter(Inventory.location_id == int(location_id))
        .group_by(Inventory.product_id)
        .all()
    )
    if not rows:
        return 0.0, 0.0

    product_ids = [int(r[0]) for r in rows if r[0] is not None]
    footprints = load_product_footprints_bulk(db, product_ids)
    total_vol = 0.0
    total_weight = 0.0
    for pid_raw, qty_raw in rows:
        qty = float(qty_raw or 0)
        if qty <= 1e-12:
            continue
        fp = footprints.get(int(pid_raw))
        if fp is None:
            continue
        total_vol += qty * float(fp.volume_dm3)
        total_weight += qty * float(fp.weight_kg)
    return total_vol, total_weight


def utilization_percent(occupied_vol: float, total_vol: float) -> float:
    if total_vol <= 1e-12:
        return 0.0
    return min(100.0, max(0.0, (occupied_vol / total_vol) * 100.0))


def capacity_state_from_utilization(util: float) -> str:
    if util <= 0.01:
        return CAPACITY_EMPTY
    if util < 25:
        return CAPACITY_LOW
    if util < 60:
        return CAPACITY_MEDIUM
    if util < 95:
        return CAPACITY_HIGH
    if util <= 100:
        return CAPACITY_FULL
    return CAPACITY_OVERFLOW


def recalculate_location_occupancy(db: Session, location_id: int, *, commit: bool = True) -> dict[str, Any]:
    loc = db.query(Location).filter(Location.id == int(location_id)).first()
    if loc is None:
        raise LocationNotFoundError(f"Location {location_id} not found")

    occ_vol, occ_weight = aggregate_location_occupancy_from_inventory(db, location_id=int(location_id))
    total_vol = location_volume_capacity_dm3(loc)
    util = utilization_percent(occ_vol, total_vol)

    loc.occupied_volume_dm3 = round(occ_vol, 4)
    loc.occupied_weight_kg = round(occ_weight, 4)
    loc.capacity_utilization_percent = round(util, 2)
    loc.last_capacity_recalculated_at = datetime.utcnow()
    loc.touch_updated()

    if commit:
        db.commit()
        db.refresh(loc)

    logger.info(
        "[slotting.occupancy] location_id=%s util=%.2f vol=%.2f/%.2f",
        location_id,
        util,
        occ_vol,
        total_vol,
    )
    return {
        "location_id": int(loc.id),
        "occupied_volume_dm3": float(loc.occupied_volume_dm3 or 0),
        "occupied_weight_kg": float(loc.occupied_weight_kg or 0),
        "capacity_utilization_percent": float(loc.capacity_utilization_percent or 0),
        "capacity_state": capacity_state_from_utilization(util),
    }


def recalculate_warehouse_occupancy(db: Session, warehouse_id: int, *, commit: bool = True) -> dict[str, Any]:
    loc_ids = [
        int(r[0])
        for r in db.query(Location.id)
        .filter(Location.warehouse_id == int(warehouse_id), Location.is_active.is_(True))
        .all()
    ]
    updated = 0
    for lid in loc_ids:
        recalculate_location_occupancy(db, lid, commit=False)
        updated += 1
    if commit:
        db.commit()
    return {"warehouse_id": int(warehouse_id), "locations_updated": updated}
