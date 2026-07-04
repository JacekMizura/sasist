"""Production material consumption — shared by WMS terminal and ERP paper mode."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ...models.inventory_serial import SERIAL_STATUS_ON_HAND, SERIAL_STATUS_PICKED, InventorySerial
from ..inventory_lot_keys import normalize_batch_number
from ..order_item_pick_allocation_service import PickLotSlice, consume_inventory_fifo_slices


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
    stock_disposition: str = "SALEABLE",
) -> list[PickLotSlice]:
    """Consume inventory for production RW — optional lot/serial targeting (paper mode)."""
    qty = float(quantity or 0)
    if qty <= 1e-12:
        return []

    lot_key = normalize_batch_number(lot or batch_number or None)
    sn = (serial_number or "").strip()

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
        take_qty = min(qty, 1.0)
        slices = consume_inventory_fifo_slices(
            db,
            tenant_id=int(tenant_id),
            warehouse_id=int(warehouse_id),
            product_id=int(product_id),
            location_id=int(location_id),
            quantity=take_qty,
            batch_number=lot_key or None,
            stock_disposition=stock_disposition,
        )
        ser.status = SERIAL_STATUS_PICKED
        return slices

    return consume_inventory_fifo_slices(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        location_id=int(location_id),
        quantity=qty,
        batch_number=lot_key or None,
        stock_disposition=stock_disposition,
    )
