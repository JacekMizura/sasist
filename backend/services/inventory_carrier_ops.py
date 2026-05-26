"""Operacje inventory związane z nośnikami (warstwa dodatkowa, bez zmiany istniejących flow bez carrier_id)."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.location import Location
from ..models.warehouse_carrier import WarehouseCarrier
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .stock_disposition import normalize_stock_disposition


def _normalize_location_uuid(db: Session, lid: int) -> Optional[str]:
    loc = db.query(Location).filter(Location.id == int(lid)).first()
    if not loc:
        return None
    u = (getattr(loc, "location_uuid", None) or "").strip()
    return u or None


def upsert_dock_inventory_for_carrier_receipt(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    product_id: int,
    carrier_id: int,
    add_qty: float,
    batch_number: str,
    expiry_date,
    stock_disposition: str,
) -> None:
    """Zwiększa stan na lokacji przyjęcia PZ z przypisanym ``carrier_id`` (partia jak na linii dokumentu)."""
    if add_qty <= 1e-12:
        return
    c = (
        db.query(WarehouseCarrier)
        .filter(
            WarehouseCarrier.id == int(carrier_id),
            WarehouseCarrier.tenant_id == int(tenant_id),
            WarehouseCarrier.deleted_at.is_(None),
        )
        .first()
    )
    if not c:
        raise ValueError("Nie znaleziono nośnika dla tenanta")
    bn = normalize_batch_number(batch_number)
    ed = expiry_date if expiry_date is not None else NO_EXPIRY_SENTINEL
    sd = normalize_stock_disposition(stock_disposition)
    loc_uuid = _normalize_location_uuid(db, int(location_id))
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.carrier_id == int(carrier_id),
            Inventory.batch_number == bn,
            Inventory.expiry_date == ed,
            Inventory.stock_disposition == sd,
        )
        .first()
    )
    if inv:
        inv.quantity = float(inv.quantity or 0) + float(add_qty)
        if loc_uuid:
            inv.location_uuid = loc_uuid
        db.add(inv)
    else:
        db.add(
            Inventory(
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(product_id),
                location_id=int(location_id),
                carrier_id=int(carrier_id),
                location_uuid=loc_uuid,
                quantity=float(add_qty),
                batch_number=bn,
                expiry_date=ed,
                stock_disposition=sd,
            )
        )
    c.current_location_id = int(location_id)
    c.updated_at = datetime.utcnow()
    db.add(c)


def upsert_dock_inventory_for_loose_receipt(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    product_id: int,
    add_qty: float,
    batch_number: str,
    expiry_date,
    stock_disposition: str,
) -> None:
    """Zwiększa stan luzem na lokacji przyjęcia PZ (``carrier_id IS NULL``)."""
    if add_qty <= 1e-12:
        return
    bn = normalize_batch_number(batch_number)
    ed = expiry_date if expiry_date is not None else NO_EXPIRY_SENTINEL
    sd = normalize_stock_disposition(stock_disposition)
    loc_uuid = _normalize_location_uuid(db, int(location_id))
    inv = (
        db.query(Inventory)
        .filter(
            Inventory.tenant_id == int(tenant_id),
            Inventory.warehouse_id == int(warehouse_id),
            Inventory.product_id == int(product_id),
            Inventory.location_id == int(location_id),
            Inventory.carrier_id.is_(None),
            Inventory.batch_number == bn,
            Inventory.expiry_date == ed,
            Inventory.stock_disposition == sd,
        )
        .first()
    )
    if inv:
        inv.quantity = float(inv.quantity or 0) + float(add_qty)
        if loc_uuid:
            inv.location_uuid = loc_uuid
        db.add(inv)
    else:
        db.add(
            Inventory(
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(product_id),
                location_id=int(location_id),
                carrier_id=None,
                location_uuid=loc_uuid,
                quantity=float(add_qty),
                batch_number=bn,
                expiry_date=ed,
                stock_disposition=sd,
            )
        )
