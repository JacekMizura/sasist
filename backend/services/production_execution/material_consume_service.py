"""Production material consumption — shared by WMS terminal and ERP paper mode."""

from __future__ import annotations

from datetime import date

from sqlalchemy.orm import Session

from ...models.inventory_serial import SERIAL_STATUS_ON_HAND, SERIAL_STATUS_PICKED, InventorySerial
from ..inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from ..order_item_pick_allocation_service import PickLotSlice, consume_inventory_fifo_slices
from .material_cost_layers import expand_pick_slices_with_cost


def consume_production_material_slices(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    location_id: int,
    quantity: float,
    batch_number: str | None = None,
    lot: str | None = None,
    serial_number: str | None = None,
    expiry_date: date | None = None,
    stock_disposition: str = "SALEABLE",
    exclude_production_order_id: int | None = None,
) -> list[PickLotSlice]:
    """Consume inventory for production RW — optional lot/serial/expiry targeting.

    Returns physical FIFO/FEFO slices enriched with frozen receipt/product unit costs.
    When ``expiry_date`` is set, consume is limited to that expiry layer (same LOT may
    have multiple expiry rows).
    """
    qty = float(quantity or 0)
    if qty <= 1e-12:
        return []

    lot_key = normalize_batch_number(lot or batch_number or None)
    sn = (serial_number or "").strip()
    exclude_mo = int(exclude_production_order_id) if exclude_production_order_id else None
    exp = expiry_date if expiry_date is not None and expiry_date < NO_EXPIRY_SENTINEL else None

    if sn:
        ser = (
            db.query(InventorySerial)
            .filter(
                InventorySerial.tenant_id == int(tenant_id),
                InventorySerial.warehouse_id == int(warehouse_id),
                InventorySerial.product_id == int(product_id),
                InventorySerial.location_id == int(location_id),
                InventorySerial.serial_number == sn,
                InventorySerial.status == SERIAL_STATUS_ON_HAND,
            )
            .with_for_update()
            .first()
        )
        if ser is None:
            raise ValueError(f"Numer seryjny „{sn}” nie jest dostępny w wybranej lokalizacji.")
        lot_key = normalize_batch_number(getattr(ser, "batch_number", None) or lot_key)
        ser_exp = getattr(ser, "expiry_date", None)
        if ser_exp is not None and ser_exp < NO_EXPIRY_SENTINEL:
            exp = ser_exp
        take_qty = min(qty, 1.0)
        slices = consume_inventory_fifo_slices(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            location_id=int(location_id),
            quantity=take_qty,
            batch_number=lot_key or None,
            expiry_date=exp,
            stock_disposition=stock_disposition,
            exclude_production_order_id=exclude_mo,
        )
        ser.status = SERIAL_STATUS_PICKED
        return expand_pick_slices_with_cost(
            db,
            slices,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
        )

    slices = consume_inventory_fifo_slices(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        location_id=int(location_id),
        quantity=qty,
        batch_number=lot_key or None,
        expiry_date=exp,
        stock_disposition=stock_disposition,
        exclude_production_order_id=exclude_mo,
    )
    return expand_pick_slices_with_cost(
        db,
        slices,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
    )
