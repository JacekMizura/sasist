"""
API: Warehouses (global list and create)

GET /warehouses - list all warehouses
POST /warehouses - create warehouse (optionally with owner_tenant_id for first assignment)
GET /warehouses/{warehouse_id}/inventory-value - computed inventory value (inventory_units.quantity * product.purchase_price)
"""

import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db

logger = logging.getLogger(__name__)
from ..models.inventory_unit import InventoryUnit
from ..models.inventory import Inventory
from ..models.product import Product
from ..models.warehouse import Warehouse
from ..models.location import Location
from ..schemas.warehouse import WarehouseCreate, WarehouseRead, WarehouseUpdate
from ..services.location_badge import batch_location_storage_types, wms_location_badge_kind
from ..services.warehouse_service import WarehouseService

router = APIRouter(prefix="/warehouses", tags=["Warehouses"])


class WarehouseCreateBody(WarehouseCreate):
    owner_tenant_id: int | None = None


@router.get("/", response_model=List[WarehouseRead])
def get_all_warehouses(db: Session = Depends(get_db)):
    service = WarehouseService(db)
    return service.get_all_warehouses()


@router.post("/", response_model=WarehouseRead, status_code=201)
def create_warehouse(data: WarehouseCreateBody, db: Session = Depends(get_db)):
    service = WarehouseService(db)
    return service.create_warehouse_standalone(data.name, owner_tenant_id=data.owner_tenant_id)


@router.put("/{warehouse_id}", response_model=WarehouseRead)
def update_warehouse(warehouse_id: int, data: WarehouseUpdate, db: Session = Depends(get_db)):
    service = WarehouseService(db)
    if data.name is None and data.requires_putaway is None:
        raise HTTPException(status_code=400, detail="Podaj nazwę lub profil putaway.")
    try:
        return service.update_warehouse(
            warehouse_id,
            name=data.name,
            requires_putaway=data.requires_putaway,
        )
    except ValueError as e:
        msg = str(e)
        if "nie istnieje" in msg:
            raise HTTPException(status_code=404, detail=msg) from e
        raise HTTPException(status_code=409, detail=msg) from e


def _warehouse_inventory_value(db: Session, warehouse_id: int) -> float:
    """SUM(inventory_units.quantity * product.purchase_price) for the warehouse. Not stored in DB."""
    # Debug: record count before computing analytics
    inventory_units_count = db.query(InventoryUnit).filter(InventoryUnit.warehouse_id == warehouse_id).count()
    logger.info(
        "analytics warehouse inventory_value: warehouse_id=%s inventory_units_count=%s",
        warehouse_id, inventory_units_count,
    )
    row = (
        db.query(func.coalesce(func.sum(InventoryUnit.quantity * func.coalesce(Product.purchase_price, 0)), 0))
        .select_from(InventoryUnit)
        .join(Product, InventoryUnit.product_id == Product.id)
        .filter(InventoryUnit.warehouse_id == warehouse_id)
        .scalar()
    )
    value = float(row) if row is not None else 0.0
    # Fallback: if inventory_units empty but legacy inventory has data, use it
    if value == 0 and inventory_units_count == 0:
        inv_row = (
            db.query(func.coalesce(func.sum(Inventory.quantity * func.coalesce(Product.purchase_price, 0)), 0))
            .select_from(Inventory)
            .join(Product, Inventory.product_id == Product.id)
            .filter(Inventory.warehouse_id == warehouse_id)
            .scalar()
        )
        value = float(inv_row) if inv_row is not None else 0.0
        if value > 0:
            logger.info("analytics warehouse inventory_value: used legacy inventory table (inventory_units empty)")
    return value


@router.get("/{warehouse_id}/inventory-value")
def get_warehouse_inventory_value(warehouse_id: int, db: Session = Depends(get_db)):
    """Computed inventory value for the warehouse. Does not modify any inventory tables."""
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    value = _warehouse_inventory_value(db, warehouse_id)
    return {"warehouse_id": warehouse_id, "inventory_value": round(value, 2)}


def _remaining_weight_kg(loc: Location) -> float | None:
    max_w = getattr(loc, "max_weight_kg", None)
    if max_w is None:
        return None
    try:
        return round(
            max(
                0.0,
                float(max_w or 0) - float(getattr(loc, "occupied_weight_kg", 0) or 0),
            ),
            4,
        )
    except (TypeError, ValueError):
        logger.warning(
            "[warehouses.locations] invalid weight fields location_id=%s max_weight_kg=%r occupied_weight_kg=%r",
            getattr(loc, "id", None),
            max_w,
            getattr(loc, "occupied_weight_kg", None),
        )
        return None


@router.get("/{warehouse_id}/locations")
def get_warehouse_locations(warehouse_id: int, db: Session = Depends(get_db)):
    """List locations: WMS `type` (badge kind), `storage_type` (layout bin chrome), optional zone / capacity_type."""
    try:
        wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
        if not wh:
            raise HTTPException(status_code=404, detail="Warehouse not found")
        rows = (
            db.query(Location)
            .filter(Location.warehouse_id == warehouse_id)
            .order_by(Location.id)
            .all()
        )
        st_by_lid = batch_location_storage_types(db, warehouse_id, rows)
        out = []
        for loc in rows:
            code = (loc.name or "").strip() or f"#{loc.id}"
            lid = int(loc.id)
            zn = (getattr(loc, "rack_name", None) or "").strip() or None
            ct = (getattr(loc, "type", None) or "").strip().lower() or None
            out.append(
                {
                    "id": loc.id,
                    "name": code,
                    "code": code,
                    "type": wms_location_badge_kind(loc),
                    "storage_type": st_by_lid.get(lid, "unknown"),
                    "zone": zn,
                    "capacity_type": ct,
                    "x": loc.x,
                    "y": loc.y,
                    "occupied_volume_dm3": round(float(getattr(loc, "occupied_volume_dm3", 0) or 0), 4),
                    "occupied_weight_kg": round(float(getattr(loc, "occupied_weight_kg", 0) or 0), 4),
                    "capacity_utilization_percent": round(
                        float(getattr(loc, "capacity_utilization_percent", 0) or 0), 2
                    ),
                    "remaining_volume_dm3": round(
                        max(
                            0.0,
                            float(getattr(loc, "width", 0) or 0)
                            * float(getattr(loc, "depth", 0) or 0)
                            * float(getattr(loc, "height", 0) or 0)
                            / 1000.0
                            - float(getattr(loc, "occupied_volume_dm3", 0) or 0),
                        ),
                        4,
                    ),
                    "remaining_weight_kg": _remaining_weight_kg(loc),
                }
            )
        logger.info("[warehouses.locations] warehouse_id=%s count=%s", warehouse_id, len(out))
        return out
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("[warehouses.locations] failed warehouse_id=%s", warehouse_id)
        raise HTTPException(status_code=500, detail="Failed to list warehouse locations") from exc
