"""
ROUTER: Tenant API

GET /tenants/{tenant_id}/inventory-value - total inventory value (optionally with per-warehouse breakdown).
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..database import get_db
from ..models.tenant import Tenant
from ..models.inventory_unit import InventoryUnit
from ..models.inventory import Inventory
from ..models.product import Product
from ..models.order import Order
from ..models.order_item import OrderItem

logger = logging.getLogger(__name__)
from ..schemas.tenant import TenantCreate, TenantRead, TenantLabelDefaultsUpdate
from ..services.tenant_service import TenantService

router = APIRouter(prefix="/tenants", tags=["Tenants"])


@router.post("/", response_model=TenantRead)
def create_tenant(data: TenantCreate, db: Session = Depends(get_db)):
    service = TenantService(db)
    return service.create_tenant(data.name)


@router.get("/", response_model=list[TenantRead])
def get_all_tenants(db: Session = Depends(get_db)):
    service = TenantService(db)
    return service.get_all()


@router.get("/{tenant_id}", response_model=TenantRead)
def get_tenant(tenant_id: int, db: Session = Depends(get_db)):
    service = TenantService(db)
    tenant = service.get_by_id(tenant_id)
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.patch("/{tenant_id}/label-defaults", response_model=TenantRead)
def update_tenant_label_defaults(
    tenant_id: int,
    data: TenantLabelDefaultsUpdate,
    db: Session = Depends(get_db),
):
    """Update which label templates are used by default for cart, basket, and location labels."""
    service = TenantService(db)
    tenant = service.update_label_defaults(
        tenant_id,
        default_cart_template_id=data.default_cart_template_id,
        default_basket_template_id=data.default_basket_template_id,
        default_location_template_id=data.default_location_template_id,
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


def _tenant_inventory_value(db: Session, tenant_id: int):
    """
    Returns (total_value, list of (warehouse_id, value)).
    SUM(inventory_units.quantity * product.purchase_price) for tenant; not stored in DB.
    """
    # Debug: record counts before computing analytics
    inventory_units_count = db.query(InventoryUnit).filter(InventoryUnit.tenant_id == tenant_id).count()
    orders_count = db.query(Order).filter(Order.tenant_id == tenant_id).count()
    order_items_count = db.query(OrderItem).join(Order).filter(Order.tenant_id == tenant_id).count()
    logger.info(
        "analytics tenant inventory_value: tenant_id=%s orders_count=%s order_items_count=%s inventory_units_count=%s",
        tenant_id, orders_count, order_items_count, inventory_units_count,
    )
    total_row = (
        db.query(func.coalesce(func.sum(InventoryUnit.quantity * func.coalesce(Product.purchase_price, 0)), 0))
        .select_from(InventoryUnit)
        .join(Product, InventoryUnit.product_id == Product.id)
        .filter(InventoryUnit.tenant_id == tenant_id)
        .scalar()
    )
    total = float(total_row) if total_row is not None else 0.0
    by_warehouse = (
        db.query(
            InventoryUnit.warehouse_id,
            func.coalesce(func.sum(InventoryUnit.quantity * func.coalesce(Product.purchase_price, 0)), 0).label("value"),
        )
        .select_from(InventoryUnit)
        .join(Product, InventoryUnit.product_id == Product.id)
        .filter(InventoryUnit.tenant_id == tenant_id)
        .group_by(InventoryUnit.warehouse_id)
        .all()
    )
    warehouses = [{"warehouse_id": wh_id, "value": round(float(val), 2)} for wh_id, val in by_warehouse]
    # Fallback: if inventory_units is empty but legacy inventory table has data, use it for analytics
    if total == 0 and inventory_units_count == 0:
        inv_total_row = (
            db.query(func.coalesce(func.sum(Inventory.quantity * func.coalesce(Product.purchase_price, 0)), 0))
            .select_from(Inventory)
            .join(Product, Inventory.product_id == Product.id)
            .filter(Inventory.tenant_id == tenant_id)
            .scalar()
        )
        total = float(inv_total_row) if inv_total_row is not None else 0.0
        inv_by_wh = (
            db.query(
                Inventory.warehouse_id,
                func.coalesce(func.sum(Inventory.quantity * func.coalesce(Product.purchase_price, 0)), 0).label("value"),
            )
            .select_from(Inventory)
            .join(Product, Inventory.product_id == Product.id)
            .filter(Inventory.tenant_id == tenant_id)
            .group_by(Inventory.warehouse_id)
            .all()
        )
        warehouses = [{"warehouse_id": wh_id, "value": round(float(val), 2)} for wh_id, val in inv_by_wh]
        if total > 0:
            logger.info("analytics tenant inventory_value: used legacy inventory table (inventory_units empty)")
    return total, warehouses


@router.get("/{tenant_id}/inventory-value")
def get_tenant_inventory_value(
    tenant_id: int,
    db: Session = Depends(get_db),
    breakdown: bool = Query(True, description="Include per-warehouse values"),
):
    """Computed total inventory value for the tenant. Optionally includes per-warehouse breakdown. Does not modify inventory tables."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    total, warehouses = _tenant_inventory_value(db, tenant_id)
    payload = {
        "tenant_id": tenant_id,
        "total_inventory_value": round(total, 2),
    }
    if breakdown:
        payload["warehouses"] = warehouses
    return payload
