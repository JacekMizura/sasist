"""
API: Inventory (enterprise stock model).

Stock = physical quantity. Reserved = SUM(stock_reservations WHERE status='reserved') per location.
Available = quantity - reserved. Response shape unchanged for existing UI.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional

from ..database import get_db
from ..models.stock import Stock
from ..models.stock_reservation import StockReservation
from ..models.tenant import Tenant
from ..models.product import Product
from ..models.warehouse import Warehouse
from ..models.location import Location
from ..schemas.inventory import (
    InventoryUnitRead,
    InventoryReadWithNames,
    InventoryCreate,
)

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def _reserved_for_stock(db: Session, stock_rows: list) -> dict:
    """Return {(tenant_id, product_id, location_id): reserved_sum} for status='reserved'."""
    if not stock_rows:
        return {}
    keys = [(r.tenant_id, r.product_id, r.location_id) for r in stock_rows]
    q = (
        db.query(
            StockReservation.tenant_id,
            StockReservation.product_id,
            StockReservation.location_id,
            func.coalesce(func.sum(StockReservation.quantity), 0).label("reserved"),
        )
        .filter(StockReservation.status == "reserved")
        .group_by(
            StockReservation.tenant_id,
            StockReservation.product_id,
            StockReservation.location_id,
        )
    )
    if keys:
        q = q.filter(
            or_(
                *[
                    and_(
                        StockReservation.tenant_id == t,
                        StockReservation.product_id == p,
                        StockReservation.location_id == loc,
                    )
                    for (t, p, loc) in keys
                ]
            )
        )
    sub = q.all()
    return {(r.tenant_id, r.product_id, r.location_id): float(r.reserved) for r in sub}


@router.get("/", response_model=List[InventoryReadWithNames])
def list_inventory(
    tenant_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    product_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(Stock)
    if tenant_id is not None:
        q = q.filter(Stock.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(Stock.warehouse_id == warehouse_id)
    if product_id is not None:
        q = q.filter(Stock.product_id == product_id)
    if location_id is not None:
        q = q.filter(Stock.location_id == location_id)
    rows = q.all()
    reserved_map = _reserved_for_stock(db, rows)
    tenants = {t.id: t.name for t in db.query(Tenant).filter(Tenant.id.in_({r.tenant_id for r in rows})).all()}
    products = {p.id: p.name for p in db.query(Product).filter(Product.id.in_({r.product_id for r in rows})).all()}
    warehouses = {w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_({r.warehouse_id for r in rows})).all()}
    locations = {loc.id: loc.name for loc in db.query(Location).filter(Location.id.in_({r.location_id for r in rows})).all()}
    out = []
    for r in rows:
        key = (r.tenant_id, r.product_id, r.location_id)
        reserved = reserved_map.get(key, 0.0)
        qty = float(r.quantity)
        available = max(0.0, qty - reserved)
        out.append(InventoryReadWithNames(
            id=r.id,
            tenant_id=r.tenant_id,
            product_id=r.product_id,
            warehouse_id=r.warehouse_id,
            location_id=r.location_id,
            quantity=qty,
            reserved_quantity=reserved,
            available_quantity=available,
            batch=None,
            serial_number=None,
            expiration_date=None,
            tenant_name=tenants.get(r.tenant_id),
            product_name=products.get(r.product_id),
            warehouse_name=warehouses.get(r.warehouse_id),
            location_name=locations.get(r.location_id),
        ))
    return out


@router.post("/", response_model=InventoryUnitRead, status_code=201)
def create_inventory_unit(body: InventoryCreate, db: Session = Depends(get_db)):
    """Create or update stock: insert new row (no upsert; use existing stock row if same keys)."""
    existing = (
        db.query(Stock)
        .filter(
            Stock.tenant_id == body.tenant_id,
            Stock.product_id == body.product_id,
            Stock.warehouse_id == body.warehouse_id,
            Stock.location_id == body.location_id,
        )
        .first()
    )
    if existing:
        existing.quantity = (existing.quantity or 0) + body.quantity
        db.commit()
        db.refresh(existing)
        reserved = (
            db.query(func.coalesce(func.sum(StockReservation.quantity), 0))
            .filter(
                StockReservation.tenant_id == existing.tenant_id,
                StockReservation.product_id == existing.product_id,
                StockReservation.location_id == existing.location_id,
                StockReservation.status == "reserved",
            )
            .scalar()
        ) or 0
        return InventoryUnitRead(
            id=existing.id,
            tenant_id=existing.tenant_id,
            product_id=existing.product_id,
            warehouse_id=existing.warehouse_id,
            location_id=existing.location_id,
            quantity=float(existing.quantity),
            reserved_quantity=float(reserved),
            available_quantity=max(0.0, float(existing.quantity) - float(reserved)),
            batch=None,
            serial_number=None,
            expiration_date=None,
        )
    stock = Stock(
        tenant_id=body.tenant_id,
        product_id=body.product_id,
        warehouse_id=body.warehouse_id,
        location_id=body.location_id,
        quantity=body.quantity,
    )
    db.add(stock)
    db.commit()
    db.refresh(stock)
    return InventoryUnitRead(
        id=stock.id,
        tenant_id=stock.tenant_id,
        product_id=stock.product_id,
        warehouse_id=stock.warehouse_id,
        location_id=stock.location_id,
        quantity=float(stock.quantity),
        reserved_quantity=0.0,
        available_quantity=float(stock.quantity),
        batch=None,
        serial_number=None,
        expiration_date=None,
    )


@router.get("/{inventory_id}", response_model=InventoryReadWithNames)
def get_inventory(inventory_id: int, db: Session = Depends(get_db)):
    r = db.query(Stock).filter(Stock.id == inventory_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Inventory not found")
    reserved = (
        db.query(func.coalesce(func.sum(StockReservation.quantity), 0))
        .filter(
            StockReservation.tenant_id == r.tenant_id,
            StockReservation.product_id == r.product_id,
            StockReservation.location_id == r.location_id,
            StockReservation.status == "reserved",
        )
        .scalar()
    ) or 0
    qty = float(r.quantity)
    available = max(0.0, qty - float(reserved))
    tenant = db.query(Tenant).filter(Tenant.id == r.tenant_id).first()
    product = db.query(Product).filter(Product.id == r.product_id).first()
    warehouse = db.query(Warehouse).filter(Warehouse.id == r.warehouse_id).first()
    location = db.query(Location).filter(Location.id == r.location_id).first()
    return InventoryReadWithNames(
        id=r.id,
        tenant_id=r.tenant_id,
        product_id=r.product_id,
        warehouse_id=r.warehouse_id,
        location_id=r.location_id,
        quantity=qty,
        reserved_quantity=float(reserved),
        available_quantity=available,
        batch=None,
        serial_number=None,
        expiration_date=None,
        tenant_name=tenant.name if tenant else None,
        product_name=product.name if product else None,
        warehouse_name=warehouse.name if warehouse else None,
        location_name=location.name if location else None,
    )
