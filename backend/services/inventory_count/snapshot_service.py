"""Snapshot capture at inventory start — stock, reservations, lots, serials."""

from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.inventory_count.constants import (
    SNAPSHOT_KIND_RESERVATION,
    SNAPSHOT_KIND_SERIAL,
    SNAPSHOT_KIND_STOCK,
)
from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.snapshot import (
    InventorySnapshot,
    InventorySnapshotReservationLine,
    InventorySnapshotSerialLine,
    InventorySnapshotStockLine,
)
from ...models.inventory_serial import InventorySerial
from ...models.location import Location
from ...models.stock_reservation import StockReservation

logger = logging.getLogger(__name__)


def capture_inventory_snapshots(
    db: Session,
    *,
    document: InventoryDocument,
    user_id: int | None = None,
) -> dict[str, Any]:
    """
    Capture point-in-time snapshots for the warehouse scope of the document.

    Phase 1: stock + reservations + serials from live tables.
    Document lines are materialized in a later iteration from snapshot stock lines.
    """
    warehouse_id = int(document.warehouse_id)
    tenant_id = int(document.tenant_id)

    stock_rows = (
        db.query(Inventory)
        .filter(Inventory.tenant_id == tenant_id, Inventory.warehouse_id == warehouse_id)
        .all()
    )
    stock_snap = _create_snapshot_header(
        db,
        document=document,
        kind=SNAPSHOT_KIND_STOCK,
        row_count=len(stock_rows),
    )
    for inv in stock_rows:
        db.add(
            InventorySnapshotStockLine(
                snapshot_id=stock_snap.id,
                location_id=int(inv.location_id),
                product_id=int(inv.product_id),
                quantity=float(inv.quantity or 0),
                reserved_quantity=0.0,
                batch_number=getattr(inv, "batch_number", None),
                carrier_id=getattr(inv, "carrier_id", None),
                stock_disposition=getattr(inv, "stock_disposition", None),
            )
        )

    reservation_rows: list[StockReservation] = []
    try:
        reservation_rows = (
            db.query(StockReservation)
            .join(Location, Location.id == StockReservation.location_id)
            .filter(
                StockReservation.tenant_id == tenant_id,
                Location.warehouse_id == warehouse_id,
                StockReservation.status == "reserved",
            )
            .all()
        )
    except Exception:
        logger.exception("[inventory_count.snapshot] reservation snapshot skipped document_id=%s", document.id)

    serial_rows: list[InventorySerial] = []
    try:
        serial_rows = (
            db.query(InventorySerial)
            .filter(InventorySerial.tenant_id == tenant_id, InventorySerial.warehouse_id == warehouse_id)
            .all()
        )
    except Exception:
        logger.exception("[inventory_count.snapshot] serial snapshot skipped document_id=%s", document.id)

    res_snap = _create_snapshot_header(
        db,
        document=document,
        kind=SNAPSHOT_KIND_RESERVATION,
        row_count=len(reservation_rows),
    )
    for res in reservation_rows:
        db.add(
            InventorySnapshotReservationLine(
                snapshot_id=res_snap.id,
                reservation_id=int(res.id),
                order_id=getattr(res, "order_id", None),
                location_id=getattr(res, "location_id", None),
                product_id=getattr(res, "product_id", None),
                quantity=float(res.quantity or 0),
                status=str(res.status),
            )
        )

    serial_snap = _create_snapshot_header(
        db,
        document=document,
        kind=SNAPSHOT_KIND_SERIAL,
        row_count=len(serial_rows),
    )
    for ser in serial_rows:
        db.add(
            InventorySnapshotSerialLine(
                snapshot_id=serial_snap.id,
                serial_number=str(ser.serial_number),
                product_id=int(ser.product_id),
                location_id=getattr(ser, "location_id", None),
                status=str(getattr(ser, "status", "")),
            )
        )

    db.flush()
    logger.info(
        "[inventory_count.snapshot] captured document_id=%s stock=%s reservations=%s serials=%s",
        document.id,
        len(stock_rows),
        len(reservation_rows),
        len(serial_rows),
    )
    return {
        "stock_snapshot_id": stock_snap.id,
        "reservation_snapshot_id": res_snap.id,
        "serial_snapshot_id": serial_snap.id,
        "stock_rows": len(stock_rows),
        "reservation_rows": len(reservation_rows),
        "serial_rows": len(serial_rows),
    }


def _create_snapshot_header(
    db: Session,
    *,
    document: InventoryDocument,
    kind: str,
    row_count: int,
) -> InventorySnapshot:
    payload = f"{document.id}:{kind}:{row_count}"
    checksum = hashlib.sha256(payload.encode()).hexdigest()[:32]
    snap = InventorySnapshot(
        inventory_document_id=document.id,
        tenant_id=document.tenant_id,
        warehouse_id=document.warehouse_id,
        snapshot_kind=kind,
        row_count=row_count,
        checksum=checksum,
        metadata_json=json.dumps({"phase": "1"}, ensure_ascii=False),
    )
    db.add(snap)
    db.flush()
    return snap
