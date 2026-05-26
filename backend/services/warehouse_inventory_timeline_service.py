"""Read-side queries for product / location / carrier movement timelines (foundation for future UI)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from ..models.warehouse_inventory_movement import WarehouseInventoryMovement


@dataclass(frozen=True)
class MovementTimelineEntry:
    id: int
    movement_type: str
    quantity: float
    inventory_bucket: str
    product_id: int
    operator_admin_id: Optional[int]
    from_location_id: Optional[int]
    to_location_id: Optional[int]
    from_carrier_id: Optional[int]
    to_carrier_id: Optional[int]
    source_document_type: Optional[str]
    source_document_id: Optional[int]
    source_line_id: Optional[int]
    lot_number: Optional[str]
    serial_number: Optional[str]
    created_at: datetime
    metadata_json: Optional[str]


def _row_to_entry(row: WarehouseInventoryMovement) -> MovementTimelineEntry:
    return MovementTimelineEntry(
        id=int(row.id),
        movement_type=str(row.movement_type),
        quantity=float(row.quantity),
        inventory_bucket=str(row.inventory_bucket),
        product_id=int(row.product_id),
        operator_admin_id=int(row.operator_admin_id) if row.operator_admin_id is not None else None,
        from_location_id=int(row.from_location_id) if row.from_location_id is not None else None,
        to_location_id=int(row.to_location_id) if row.to_location_id is not None else None,
        from_carrier_id=int(row.from_carrier_id) if row.from_carrier_id is not None else None,
        to_carrier_id=int(row.to_carrier_id) if row.to_carrier_id is not None else None,
        source_document_type=row.source_document_type,
        source_document_id=int(row.source_document_id) if row.source_document_id is not None else None,
        source_line_id=int(row.source_line_id) if row.source_line_id is not None else None,
        lot_number=row.lot_number,
        serial_number=row.serial_number,
        created_at=row.created_at,
        metadata_json=row.metadata_json,
    )


def list_product_movement_timeline(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    limit: int = 200,
    since: Optional[datetime] = None,
) -> List[MovementTimelineEntry]:
    q = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.tenant_id == int(tenant_id),
            WarehouseInventoryMovement.warehouse_id == int(warehouse_id),
            WarehouseInventoryMovement.product_id == int(product_id),
        )
        .order_by(WarehouseInventoryMovement.created_at.desc(), WarehouseInventoryMovement.id.desc())
    )
    if since is not None:
        q = q.filter(WarehouseInventoryMovement.created_at >= since)
    rows = q.limit(max(1, min(int(limit), 1000))).all()
    return [_row_to_entry(r) for r in rows]


def list_location_movement_timeline(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    location_id: int,
    limit: int = 200,
    since: Optional[datetime] = None,
) -> List[MovementTimelineEntry]:
    lid = int(location_id)
    q = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.tenant_id == int(tenant_id),
            WarehouseInventoryMovement.warehouse_id == int(warehouse_id),
        )
        .filter(
            (WarehouseInventoryMovement.from_location_id == lid)
            | (WarehouseInventoryMovement.to_location_id == lid)
        )
        .order_by(WarehouseInventoryMovement.created_at.desc(), WarehouseInventoryMovement.id.desc())
    )
    if since is not None:
        q = q.filter(WarehouseInventoryMovement.created_at >= since)
    rows = q.limit(max(1, min(int(limit), 1000))).all()
    return [_row_to_entry(r) for r in rows]


def list_carrier_movement_timeline(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    carrier_id: int,
    limit: int = 200,
    since: Optional[datetime] = None,
) -> List[MovementTimelineEntry]:
    cid = int(carrier_id)
    q = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.tenant_id == int(tenant_id),
            WarehouseInventoryMovement.warehouse_id == int(warehouse_id),
        )
        .filter(
            (WarehouseInventoryMovement.from_carrier_id == cid)
            | (WarehouseInventoryMovement.to_carrier_id == cid)
        )
        .order_by(WarehouseInventoryMovement.created_at.desc(), WarehouseInventoryMovement.id.desc())
    )
    if since is not None:
        q = q.filter(WarehouseInventoryMovement.created_at >= since)
    rows = q.limit(max(1, min(int(limit), 1000))).all()
    return [_row_to_entry(r) for r in rows]


def list_operator_movements_today(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    operator_admin_id: int,
    limit: int = 500,
) -> List[MovementTimelineEntry]:
    """Movements touched by one operator (shift / daily audit)."""
    start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    q = (
        db.query(WarehouseInventoryMovement)
        .filter(
            WarehouseInventoryMovement.tenant_id == int(tenant_id),
            WarehouseInventoryMovement.warehouse_id == int(warehouse_id),
            WarehouseInventoryMovement.operator_admin_id == int(operator_admin_id),
            WarehouseInventoryMovement.created_at >= start,
        )
        .order_by(WarehouseInventoryMovement.created_at.desc(), WarehouseInventoryMovement.id.desc())
    )
    rows = q.limit(max(1, min(int(limit), 2000))).all()
    return [_row_to_entry(r) for r in rows]
