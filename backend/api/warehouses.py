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
from ..schemas.warehouse import WarehouseCreate, WarehouseRead
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


@router.get("/{warehouse_id}/locations")
def get_warehouse_locations(warehouse_id: int, db: Session = Depends(get_db)):
    """List locations for the warehouse (id, name, x, y). For graph map visualization."""
    wh = db.query(Warehouse).filter(Warehouse.id == warehouse_id).first()
    if not wh:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    rows = (
        db.query(Location.id, Location.name, Location.x, Location.y)
        .filter(Location.warehouse_id == warehouse_id)
        .all()
    )
    return [
        {"id": r.id, "name": r.name or "", "x": r.x, "y": r.y}
        for r in rows
    ]
