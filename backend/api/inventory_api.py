"""
API: Inventory (single source physical stock model).

Inventory = physical quantity. Reserved = SUM(stock_reservations WHERE status='reserved') per location.
Available = quantity - reserved. Response shape unchanged for existing UI.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, and_
from typing import List, Optional
import logging

from ..database import get_db
from ..models.inventory import Inventory
from ..models.stock_reservation import StockReservation
from ..models.tenant import Tenant
from ..models.product import Product
from ..models.warehouse import Warehouse, Bin
from ..models.location import Location
from ..schemas.inventory import (
    InventoryUnitRead,
    InventoryReadWithNames,
    InventoryCreate,
)
from ..services.inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number, storage_expiry_date
from ..services.stock_disposition import normalize_stock_disposition
from ..services.inventory_operational_location_filter import exclude_location_from_operational_inventory_list

router = APIRouter(prefix="/inventory", tags=["Inventory"])
logger = logging.getLogger(__name__)


def _normalize_location_uuid(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    v = value.strip()
    if not v or v.lower() == "null":
        return None
    return v


def _location_uuid_by_location_id(db: Session, location_ids: set[int]) -> dict[int, str | None]:
    if not location_ids:
        return {}
    rows = db.query(Location.id, Location.location_uuid).filter(Location.id.in_(location_ids)).all()
    return {int(r[0]): _normalize_location_uuid(r[1]) for r in rows}


def _reserved_for_stock(db: Session, stock_rows: list) -> dict:
    """Return {(tenant_id, product_id, location_id, batch, expiry): reserved_sum} for status='reserved'."""
    if not stock_rows:
        return {}
    keys = []
    for r in stock_rows:
        bn = normalize_batch_number(getattr(r, "batch_number", None))
        ed = getattr(r, "expiry_date", None) or NO_EXPIRY_SENTINEL
        keys.append((r.tenant_id, r.product_id, r.location_id, bn, ed))
    q = (
        db.query(
            StockReservation.tenant_id,
            StockReservation.product_id,
            StockReservation.location_id,
            StockReservation.batch_number,
            StockReservation.expiry_date,
            func.coalesce(func.sum(StockReservation.quantity), 0).label("reserved"),
        )
        .filter(StockReservation.status == "reserved")
        .group_by(
            StockReservation.tenant_id,
            StockReservation.product_id,
            StockReservation.location_id,
            StockReservation.batch_number,
            StockReservation.expiry_date,
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
                        StockReservation.batch_number == bn,
                        StockReservation.expiry_date == ed,
                    )
                    for (t, p, loc, bn, ed) in keys
                ]
            )
        )
    sub = q.all()
    return {(r.tenant_id, r.product_id, r.location_id, r.batch_number or "", r.expiry_date): float(r.reserved) for r in sub}


@router.get("/", response_model=List[InventoryReadWithNames])
def list_inventory(
    tenant_id: Optional[int] = Query(None),
    warehouse_id: Optional[int] = Query(None),
    product_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    hide_empty: bool = Query(
        True,
        description="Ukryj wiersze z ilością 0 i brakiem rezerwacji (techniczne śmieci).",
    ),
    include_deleted_products: bool = Query(
        False,
        description="Pokaż stan dla produktów zarchiwizowanych (deleted_at). Domyślnie ukryte.",
    ),
    include_inactive_locations: bool = Query(
        False,
        description="Uwzględnij nieaktywne lokalizacje (np. po migracji).",
    ),
    inventory_debug: bool = Query(
        False,
        description="Tryb diagnostyczny: puste wiersze, zarchiwizowane produkty, nieaktywne lokalizacje, bufory techniczne (PRZYJĘCIE itd.).",
    ),
    hide_technical_locations: bool = Query(
        True,
        description="Domyślnie ukryj lokalizacje techniczne (PRZYJĘCIE, BUFOR…). Ustaw false dla mapy magazynu / integracji.",
    ),
    db: Session = Depends(get_db),
):
    if inventory_debug:
        hide_empty = False
        include_deleted_products = True
        include_inactive_locations = True
        hide_technical_locations = False

    q = db.query(Inventory)
    if tenant_id is not None:
        q = q.filter(Inventory.tenant_id == tenant_id)
    if warehouse_id is not None:
        q = q.filter(Inventory.warehouse_id == warehouse_id)
    if product_id is not None:
        q = q.filter(Inventory.product_id == product_id)
    if location_id is not None:
        q = q.filter(Inventory.location_id == location_id)

    if include_inactive_locations:
        q = q.join(Location, Location.id == Inventory.location_id)
    else:
        q = q.join(Location, Location.id == Inventory.location_id).filter(Location.is_active.is_(True))

    if include_deleted_products:
        q = q.outerjoin(Product, Product.id == Inventory.product_id)
    else:
        q = q.join(Product, Product.id == Inventory.product_id).filter(Product.deleted_at.is_(None))

    rows = q.all()
    # Domyślnie bez trybu diagnostycznego: ukryj strefy techniczne / śmieci importowe (dane w DB bez zmian).
    if hide_technical_locations and rows:
        loc_ids = {int(r.location_id) for r in rows}
        loc_objs = db.query(Location).filter(Location.id.in_(loc_ids)).all()
        excluded_locs = {loc.id for loc in loc_objs if exclude_location_from_operational_inventory_list(loc)}
        if excluded_locs:
            rows = [r for r in rows if int(r.location_id) not in excluded_locs]
    reserved_map = _reserved_for_stock(db, rows)
    tenants = {t.id: t.name for t in db.query(Tenant).filter(Tenant.id.in_({r.tenant_id for r in rows})).all()}
    products = {p.id: p.name for p in db.query(Product).filter(Product.id.in_({r.product_id for r in rows})).all()}
    warehouses = {w.id: w.name for w in db.query(Warehouse).filter(Warehouse.id.in_({r.warehouse_id for r in rows})).all()}
    location_rows = (
        db.query(Location.id, Location.name, Location.location_uuid)
        .execution_options(include_inactive=True)
        .filter(Location.id.in_({r.location_id for r in rows}))
        .all()
    )
    locations = {int(loc_id): loc_name for loc_id, loc_name, _ in location_rows}
    location_uuid_map = {int(loc_id): _normalize_location_uuid(loc_uuid) for loc_id, _loc_name, loc_uuid in location_rows}
    # Orphan detection scope: inventory.location_uuid exists but no active Bin for that UUID.
    candidate_uuids = {
        location_uuid_map.get(r.location_id) or _normalize_location_uuid(getattr(r, "location_uuid", None))
        for r in rows
    }
    candidate_uuids = {u for u in candidate_uuids if u}
    active_bin_uuids: set[str] = set()
    if candidate_uuids:
        bin_q = db.query(Bin.location_uuid).filter(
            Bin.is_active == True,  # noqa: E712
            Bin.location_uuid.in_(candidate_uuids),
        )
        active_bin_uuids = {
            u
            for u in (_normalize_location_uuid(getattr(row, "location_uuid", None)) for row in bin_q.distinct().all())
            if u is not None
        }

    out = []
    missing_uuid_count = 0
    for r in rows:
        bn = normalize_batch_number(getattr(r, "batch_number", None))
        ed = getattr(r, "expiry_date", None) or NO_EXPIRY_SENTINEL
        key = (r.tenant_id, r.product_id, r.location_id, bn, ed)
        reserved = reserved_map.get(key, 0.0)
        qty = float(r.quantity)
        if hide_empty and qty == 0.0 and reserved == 0.0:
            continue
        available = max(0.0, qty - reserved)
        # Canonical source: Location.location_uuid. Fallback to inventory row for legacy edges.
        location_uuid = location_uuid_map.get(r.location_id) or _normalize_location_uuid(getattr(r, "location_uuid", None))
        if not location_uuid:
            missing_uuid_count += 1
        orphaned_inventory = bool(location_uuid) and location_uuid not in active_bin_uuids
        if orphaned_inventory:
            logger.warning(
                "orphaned inventory: location_uuid=%s product_id=%s quantity=%s",
                location_uuid,
                r.product_id,
                qty,
            )
        exp_out = None if ed >= NO_EXPIRY_SENTINEL else ed
        out.append(InventoryReadWithNames(
            id=r.id,
            tenant_id=r.tenant_id,
            product_id=r.product_id,
            warehouse_id=r.warehouse_id,
            location_id=r.location_id,
            location_uuid=location_uuid,
            quantity=qty,
            reserved_quantity=reserved,
            available_quantity=available,
            batch=bn or None,
            serial_number=None,
            expiration_date=exp_out,
            tenant_name=tenants.get(r.tenant_id),
            product_name=products.get(r.product_id),
            warehouse_name=warehouses.get(r.warehouse_id),
            location_name=locations.get(r.location_id),
            orphaned_inventory=orphaned_inventory,
        ))
    if missing_uuid_count > 0:
        logger.warning(
            "Inventory API returned %s row(s) without location_uuid (legacy edge cases).",
            missing_uuid_count,
        )
    return out


@router.post("/", response_model=InventoryUnitRead, status_code=201)
def create_inventory_unit(body: InventoryCreate, db: Session = Depends(get_db)):
    """Create or update stock: insert new row (no upsert; use existing stock row if same keys)."""
    lot_bn = normalize_batch_number(body.batch)
    lot_ed = storage_expiry_date(bool(body.expiration_date), body.expiration_date)
    sd = normalize_stock_disposition(getattr(body, "stock_disposition", None))
    existing = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == body.tenant_id,
            Inventory.product_id == body.product_id,
            Inventory.warehouse_id == body.warehouse_id,
            Inventory.location_id == body.location_id,
            Inventory.batch_number == lot_bn,
            Inventory.expiry_date == lot_ed,
            Inventory.stock_disposition == sd,
        )
        .first()
    )
    if existing:
        existing.quantity = (existing.quantity or 0) + body.quantity
        if not _normalize_location_uuid(getattr(existing, "location_uuid", None)):
            loc = db.query(Location).filter(Location.id == existing.location_id).first()
            existing.location_uuid = _normalize_location_uuid(getattr(loc, "location_uuid", None)) if loc else None
        db.commit()
        db.refresh(existing)
        reserved = (
            db.query(func.coalesce(func.sum(StockReservation.quantity), 0))
            .filter(
                StockReservation.tenant_id == existing.tenant_id,
                StockReservation.product_id == existing.product_id,
                StockReservation.location_id == existing.location_id,
                StockReservation.batch_number == (existing.batch_number or ""),
                StockReservation.expiry_date == (existing.expiry_date or NO_EXPIRY_SENTINEL),
                StockReservation.status == "reserved",
            )
            .scalar()
        ) or 0
        ed = getattr(existing, "expiry_date", None) or NO_EXPIRY_SENTINEL
        return InventoryUnitRead(
            id=existing.id,
            tenant_id=existing.tenant_id,
            product_id=existing.product_id,
            warehouse_id=existing.warehouse_id,
            location_id=existing.location_id,
            location_uuid=_normalize_location_uuid(getattr(existing, "location_uuid", None)),
            quantity=float(existing.quantity),
            reserved_quantity=float(reserved),
            available_quantity=max(0.0, float(existing.quantity) - float(reserved)),
            batch=normalize_batch_number(getattr(existing, "batch_number", None)) or None,
            serial_number=None,
            expiration_date=None if ed >= NO_EXPIRY_SENTINEL else ed,
        )
    loc = db.query(Location).filter(Location.id == body.location_id).first()
    stock = Inventory(
        tenant_id=body.tenant_id,
        product_id=body.product_id,
        warehouse_id=body.warehouse_id,
        location_id=body.location_id,
        location_uuid=_normalize_location_uuid(getattr(loc, "location_uuid", None)) if loc else None,
        quantity=body.quantity,
        batch_number=lot_bn,
        expiry_date=lot_ed,
        stock_disposition=sd,
    )
    db.add(stock)
    db.commit()
    db.refresh(stock)
    sed = getattr(stock, "expiry_date", None) or NO_EXPIRY_SENTINEL
    return InventoryUnitRead(
        id=stock.id,
        tenant_id=stock.tenant_id,
        product_id=stock.product_id,
        warehouse_id=stock.warehouse_id,
        location_id=stock.location_id,
        location_uuid=_normalize_location_uuid(getattr(stock, "location_uuid", None)),
        quantity=float(stock.quantity),
        reserved_quantity=0.0,
        available_quantity=float(stock.quantity),
        batch=normalize_batch_number(getattr(stock, "batch_number", None)) or None,
        serial_number=None,
        expiration_date=None if sed >= NO_EXPIRY_SENTINEL else sed,
    )


@router.get("/{inventory_id}", response_model=InventoryReadWithNames)
def get_inventory(inventory_id: int, db: Session = Depends(get_db)):
    r = db.query(Inventory).filter(Inventory.id == inventory_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="Inventory not found")
    r_bn = normalize_batch_number(getattr(r, "batch_number", None))
    r_ed = getattr(r, "expiry_date", None) or NO_EXPIRY_SENTINEL
    reserved = (
        db.query(func.coalesce(func.sum(StockReservation.quantity), 0))
        .filter(
            StockReservation.tenant_id == r.tenant_id,
            StockReservation.product_id == r.product_id,
            StockReservation.location_id == r.location_id,
            StockReservation.batch_number == r_bn,
            StockReservation.expiry_date == r_ed,
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
    location_uuid = _normalize_location_uuid(getattr(r, "location_uuid", None)) or _normalize_location_uuid(
        getattr(location, "location_uuid", None)
    )
    orphaned_inventory = False
    if location_uuid:
        has_active_bin = (
            db.query(Bin.id)
            .filter(
                Bin.is_active == True,  # noqa: E712
                Bin.location_uuid == location_uuid,
            )
            .first()
            is not None
        )
        orphaned_inventory = not has_active_bin
        if orphaned_inventory:
            logger.warning(
                "orphaned inventory: location_uuid=%s product_id=%s quantity=%s",
                location_uuid,
                r.product_id,
                qty,
            )
    exp_one = None if r_ed >= NO_EXPIRY_SENTINEL else r_ed
    return InventoryReadWithNames(
        id=r.id,
        tenant_id=r.tenant_id,
        product_id=r.product_id,
        warehouse_id=r.warehouse_id,
        location_id=r.location_id,
        location_uuid=location_uuid,
        quantity=qty,
        reserved_quantity=float(reserved),
        available_quantity=available,
        batch=r_bn or None,
        serial_number=None,
        expiration_date=exp_one,
        tenant_name=tenant.name if tenant else None,
        product_name=product.name if product else None,
        warehouse_name=warehouse.name if warehouse else None,
        location_name=location.name if location else None,
        orphaned_inventory=orphaned_inventory,
    )
