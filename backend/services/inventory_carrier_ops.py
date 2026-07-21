"""Operacje inventory związane z nośnikami (warstwa dodatkowa, bez zmiany istniejących flow bez carrier_id)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

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


def _apply_signed_dock_qty(
    *,
    inv: Inventory | None,
    add_qty: float,
) -> float:
    """Return new quantity; raise if correction would go below zero without inventory row."""
    if inv is None:
        if add_qty < -1e-12:
            raise ValueError("Niewystarczający stan na DOCK-IN do korekty")
        return float(add_qty)
    new_q = float(inv.quantity or 0) + float(add_qty)
    if new_q < -1e-9:
        raise ValueError("Niewystarczający stan na DOCK-IN do korekty")
    return max(0.0, new_q)


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
    """Zmienia stan na lokacji przyjęcia PZ z ``carrier_id`` (delta +/−; partia jak na linii dokumentu)."""
    if abs(float(add_qty)) <= 1e-12:
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
    new_q = _apply_signed_dock_qty(inv=inv, add_qty=float(add_qty))
    if inv:
        inv.quantity = new_q
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
                quantity=new_q,
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
    """Zmienia stan luzem na lokacji przyjęcia PZ (``carrier_id IS NULL``; delta +/−)."""
    if abs(float(add_qty)) <= 1e-12:
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
    new_q = _apply_signed_dock_qty(inv=inv, add_qty=float(add_qty))
    if inv:
        inv.quantity = new_q
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
                quantity=new_q,
                batch_number=bn,
                expiry_date=ed,
                stock_disposition=sd,
            )
        )
