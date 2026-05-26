"""Edit inventory lot identity (batch / expiry / serial) without silent merges."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.inventory_serial import SERIAL_STATUS_ON_HAND, InventorySerial
from ..models.product import Product
from ..models.stock_reservation import StockReservation
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .inventory_serial_service import lot_keys_from_product, normalize_serial_number


class InventoryTraceabilityConflictError(ValueError):
    """Another stock row already uses the target identity."""

    def __init__(self, existing_inventory_id: int):
        self.existing_inventory_id = int(existing_inventory_id)
        super().__init__(
            "Inna pozycja magazynowa ma już tę samą partię, datę ważności i nośnik. "
            "Potwierdź scalenie lub wybierz inne dane."
        )


def _inventory_identity_query(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    location_id: int,
    warehouse_id: int,
    batch_number: str,
    expiry_date: date,
    stock_disposition: str,
    carrier_id: Optional[int],
    exclude_inventory_id: Optional[int] = None,
):
    q = db.query(Inventory).filter(
        Inventory.tenant_id == int(tenant_id),
        Inventory.product_id == int(product_id),
        Inventory.location_id == int(location_id),
        Inventory.warehouse_id == int(warehouse_id),
        Inventory.batch_number == batch_number,
        Inventory.expiry_date == expiry_date,
        Inventory.stock_disposition == stock_disposition,
    )
    if carrier_id is None:
        q = q.filter(Inventory.carrier_id.is_(None))
    else:
        q = q.filter(Inventory.carrier_id == int(carrier_id))
    if exclude_inventory_id is not None:
        q = q.filter(Inventory.id != int(exclude_inventory_id))
    return q


def _load_serials(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    serial_ids: Optional[List[int]],
    location_id: int,
    carrier_id: Optional[int],
    batch_number: str,
    expiry_date: date,
    stock_disposition: str,
) -> List[InventorySerial]:
    if serial_ids:
        rows = (
            db.query(InventorySerial)
            .filter(
                InventorySerial.tenant_id == int(tenant_id),
                InventorySerial.product_id == int(product_id),
                InventorySerial.id.in_([int(x) for x in serial_ids]),
                InventorySerial.status == SERIAL_STATUS_ON_HAND,
            )
            .all()
        )
        return rows
    return (
        db.query(InventorySerial)
        .filter(
            InventorySerial.tenant_id == int(tenant_id),
            InventorySerial.product_id == int(product_id),
            InventorySerial.location_id == int(location_id),
            InventorySerial.status == SERIAL_STATUS_ON_HAND,
            InventorySerial.batch_number == batch_number,
            InventorySerial.expiry_date == expiry_date,
            InventorySerial.stock_disposition == stock_disposition,
        )
        .filter(
            InventorySerial.carrier_id.is_(None)
            if carrier_id is None
            else InventorySerial.carrier_id == int(carrier_id)
        )
        .all()
    )


def update_inventory_traceability(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    inventory_id: Optional[int],
    inventory_serial_ids: Optional[List[int]],
    batch_number: Optional[str],
    expiry_date: Optional[date],
    serial_number: Optional[str],
    confirm_merge: bool = False,
) -> int:
    """
    Update lot metadata on an inventory row and matching ON_HAND serials / reservations.
    Returns primary inventory id (target row after optional merge).
    """
    prod = db.query(Product).filter(Product.id == int(product_id), Product.tenant_id == int(tenant_id)).first()
    if not prod:
        raise ValueError("Product not found")

    inv: Optional[Inventory] = None
    if inventory_id is not None:
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.id == int(inventory_id),
                Inventory.tenant_id == int(tenant_id),
                Inventory.product_id == int(product_id),
            )
            .first()
        )
        if not inv:
            raise ValueError("Nie znaleziono pozycji magazynowej")

    old_bn = normalize_batch_number(getattr(inv, "batch_number", None)) if inv else ""
    old_ed = getattr(inv, "expiry_date", None) if inv else NO_EXPIRY_SENTINEL
    old_carrier = getattr(inv, "carrier_id", None) if inv else None
    old_sd = (getattr(inv, "stock_disposition", None) or "SALEABLE").strip().upper() if inv else "SALEABLE"
    loc_id = int(inv.location_id) if inv else 0
    wh_id = int(inv.warehouse_id) if inv else 0

    serials = _load_serials(
        db,
        tenant_id=tenant_id,
        product_id=product_id,
        serial_ids=inventory_serial_ids,
        location_id=loc_id,
        carrier_id=old_carrier,
        batch_number=old_bn,
        expiry_date=old_ed or NO_EXPIRY_SENTINEL,
        stock_disposition=old_sd,
    )
    if inv is None:
        if not serials:
            raise ValueError("Nie znaleziono numerów seryjnych")
        s0 = serials[0]
        loc_id = int(s0.location_id or 0)
        wh_id = int(s0.warehouse_id or 0)
        old_carrier = getattr(s0, "carrier_id", None)
        old_bn = normalize_batch_number(s0.batch_number)
        old_ed = s0.expiry_date or NO_EXPIRY_SENTINEL
        old_sd = (s0.stock_disposition or "SALEABLE").strip().upper()
        inv = (
            db.query(Inventory)
            .filter(
                Inventory.tenant_id == int(tenant_id),
                Inventory.product_id == int(product_id),
                Inventory.location_id == loc_id,
                Inventory.warehouse_id == wh_id,
                Inventory.batch_number == old_bn,
                Inventory.expiry_date == old_ed,
                Inventory.stock_disposition == old_sd,
            )
            .filter(Inventory.carrier_id.is_(None) if old_carrier is None else Inventory.carrier_id == int(old_carrier))
            .first()
        )

    new_bn, new_ed = lot_keys_from_product(prod, batch_number=batch_number, expiry_date=expiry_date)

    target_inv = inv
    if inv is not None:
        conflict = _inventory_identity_query(
            db,
            tenant_id=tenant_id,
            product_id=product_id,
            location_id=loc_id,
            warehouse_id=wh_id,
            batch_number=new_bn,
            expiry_date=new_ed,
            stock_disposition=old_sd,
            carrier_id=old_carrier,
            exclude_inventory_id=int(inv.id),
        ).first()
        if conflict:
            if not confirm_merge:
                raise InventoryTraceabilityConflictError(int(conflict.id))
            conflict.quantity = float(conflict.quantity or 0) + float(inv.quantity or 0)
            db.delete(inv)
            db.flush()
            target_inv = conflict
        else:
            inv.batch_number = new_bn
            inv.expiry_date = new_ed
            db.flush()

    if not serials and inv is not None:
        serials = _load_serials(
            db,
            tenant_id=tenant_id,
            product_id=product_id,
            serial_ids=None,
            location_id=loc_id,
            carrier_id=old_carrier,
            batch_number=old_bn,
            expiry_date=old_ed or NO_EXPIRY_SENTINEL,
            stock_disposition=old_sd,
        )

    track_serial = bool(getattr(prod, "track_serial", False))
    new_sn = normalize_serial_number(serial_number or "") if serial_number else ""
    if track_serial and len(serials) == 1 and not new_sn:
        raise ValueError("Numer seryjny wymagany")
    if track_serial and new_sn:
        for s in serials:
            cur = (s.serial_number or "").strip()
            if new_sn == cur:
                continue
            other = (
                db.query(InventorySerial.id)
                .filter(
                    InventorySerial.tenant_id == int(tenant_id),
                    InventorySerial.product_id == int(product_id),
                    InventorySerial.serial_number == new_sn,
                    InventorySerial.id != int(s.id),
                )
                .first()
            )
            if other:
                raise ValueError("Numer seryjny już istnieje w magazynie.")
            s.serial_number = new_sn

    for s in serials:
        s.batch_number = new_bn
        s.expiry_date = new_ed
        if target_inv is not None:
            s.location_id = int(target_inv.location_id)
            s.warehouse_id = int(target_inv.warehouse_id)
            s.carrier_id = getattr(target_inv, "carrier_id", None)

    if target_inv is not None and (old_bn != new_bn or old_ed != new_ed):
        db.query(StockReservation).filter(
            StockReservation.tenant_id == int(tenant_id),
            StockReservation.product_id == int(product_id),
            StockReservation.location_id == int(loc_id),
            StockReservation.batch_number == old_bn,
            StockReservation.expiry_date == old_ed,
            StockReservation.status == "reserved",
        ).update(
            {StockReservation.batch_number: new_bn, StockReservation.expiry_date: new_ed},
            synchronize_session=False,
        )

    db.commit()
    if target_inv is None:
        raise ValueError("Brak wiersza magazynowego do aktualizacji — tylko numery seryjne bez stanu inventory")
    db.refresh(target_inv)
    return int(target_inv.id)
