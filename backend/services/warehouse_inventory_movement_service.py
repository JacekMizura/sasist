"""Record and query durable warehouse inventory movements (dual-write with existing stock)."""

from __future__ import annotations

import json
import logging
from datetime import date, datetime
from typing import Any, List, Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.warehouse_inventory_movement import WarehouseInventoryMovement
from ..models.wms_product_warehouse_operation import WmsProductWarehouseOperation
from .stock_disposition import (
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SCRAP,
    normalize_stock_disposition,
    stock_disposition_for_document_line,
)

_logger = logging.getLogger(__name__)

MOVEMENT_RECEIVING = "receiving"
MOVEMENT_PUTAWAY = "putaway"
MOVEMENT_MOVE = "move"
MOVEMENT_PICK = "pick"
MOVEMENT_PICK_SHORTAGE = "pick_shortage"
MOVEMENT_RELOCATION = "relocation"
MOVEMENT_DAMAGE = "damage"
MOVEMENT_RETURN = "return"
MOVEMENT_ADJUSTMENT = "adjustment"
MOVEMENT_RESERVATION = "reservation"
MOVEMENT_UNRESERVATION = "unreservation"

ALLOWED_MOVEMENT_TYPES = frozenset(
    {
        MOVEMENT_RECEIVING,
        MOVEMENT_PUTAWAY,
        MOVEMENT_MOVE,
        MOVEMENT_PICK,
        MOVEMENT_PICK_SHORTAGE,
        MOVEMENT_RELOCATION,
        MOVEMENT_DAMAGE,
        MOVEMENT_RETURN,
        MOVEMENT_ADJUSTMENT,
        MOVEMENT_RESERVATION,
        MOVEMENT_UNRESERVATION,
    }
)

BUCKET_SELLABLE = "sellable"
BUCKET_DAMAGED = "damaged"
BUCKET_QUARANTINE = "quarantine"
BUCKET_RECEIVING = "receiving"
BUCKET_RELOCATION = "relocation"
BUCKET_RESERVED = "reserved"

_PRODUCT_OP_TO_MOVEMENT = {
    "RECEIVING": MOVEMENT_RECEIVING,
    "PUTAWAY": MOVEMENT_PUTAWAY,
    "PICKING": MOVEMENT_PICK,
    "PACKING": MOVEMENT_MOVE,
    "MANUAL_MM": MOVEMENT_MOVE,
    "REPLENISHMENT": MOVEMENT_MOVE,
    "INVENTORY": MOVEMENT_ADJUSTMENT,
    "RETURN": MOVEMENT_RETURN,
    "COMPLAINT": MOVEMENT_RETURN,
}


def disposition_to_inventory_bucket(disposition: str | None) -> str:
    d = normalize_stock_disposition(disposition)
    if d in (STOCK_DISPOSITION_REJECTED_STOCK, STOCK_DISPOSITION_SCRAP):
        return BUCKET_DAMAGED
    if d == STOCK_DISPOSITION_QUARANTINE:
        return BUCKET_QUARANTINE
    return BUCKET_SELLABLE


def _normalize_movement_type(value: str) -> str:
    mt = (value or "").strip().lower()
    if mt not in ALLOWED_MOVEMENT_TYPES:
        raise ValueError(f"Invalid movement_type: {value!r}")
    return mt


def _normalize_bucket(value: str) -> str:
    b = (value or "").strip().lower()
    allowed = {
        BUCKET_SELLABLE,
        BUCKET_DAMAGED,
        BUCKET_QUARANTINE,
        BUCKET_RECEIVING,
        BUCKET_RELOCATION,
        BUCKET_RESERVED,
    }
    if b not in allowed:
        raise ValueError(f"Invalid inventory_bucket: {value!r}")
    return b


def _dump_metadata(data: Optional[dict[str, Any]]) -> Optional[str]:
    if not data:
        return None
    try:
        return json.dumps(data, separators=(",", ":"), default=str)
    except (TypeError, ValueError):
        return None


def record_inventory_movement(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    movement_type: str,
    quantity: float,
    inventory_bucket: str,
    operator_admin_id: Optional[int] = None,
    variant_id: Optional[int] = None,
    source_document_type: Optional[str] = None,
    source_document_id: Optional[int] = None,
    source_line_id: Optional[int] = None,
    from_location_id: Optional[int] = None,
    to_location_id: Optional[int] = None,
    from_carrier_id: Optional[int] = None,
    to_carrier_id: Optional[int] = None,
    lot_number: Optional[str] = None,
    serial_number: Optional[str] = None,
    expiry_date: Optional[date] = None,
    created_at: Optional[datetime] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> WarehouseInventoryMovement:
    q = float(quantity or 0)
    if not (q > 0):
        raise ValueError("quantity must be positive")
    mt = _normalize_movement_type(movement_type)
    bucket = _normalize_bucket(inventory_bucket)
    row = WarehouseInventoryMovement(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        variant_id=int(variant_id) if variant_id is not None and int(variant_id) > 0 else None,
        source_document_type=(source_document_type or "").strip()[:32] or None,
        source_document_id=int(source_document_id) if source_document_id is not None else None,
        source_line_id=int(source_line_id) if source_line_id is not None else None,
        movement_type=mt,
        quantity=q,
        from_location_id=int(from_location_id) if from_location_id is not None else None,
        to_location_id=int(to_location_id) if to_location_id is not None else None,
        from_carrier_id=int(from_carrier_id) if from_carrier_id is not None else None,
        to_carrier_id=int(to_carrier_id) if to_carrier_id is not None else None,
        lot_number=(lot_number or "").strip()[:128] or None,
        serial_number=(serial_number or "").strip()[:128] or None,
        expiry_date=expiry_date,
        inventory_bucket=bucket,
        operator_admin_id=int(operator_admin_id) if operator_admin_id is not None and int(operator_admin_id) > 0 else None,
        created_at=created_at or datetime.utcnow(),
        metadata_json=_dump_metadata(metadata),
    )
    db.add(row)
    if mt in (MOVEMENT_PUTAWAY, MOVEMENT_RECEIVING, MOVEMENT_ADJUSTMENT, MOVEMENT_RETURN, MOVEMENT_RELOCATION):
        try:
            from .recovery_intelligence import process_recovery_stock_increase

            process_recovery_stock_increase(
                db,
                tenant_id=int(tenant_id),
                warehouse_id=int(warehouse_id),
                product_id=int(product_id),
                qty_added=q,
                source_event=mt,
            )
        except Exception:
            _logger.exception(
                "recovery stock reserve hook failed product_id=%s movement=%s",
                product_id,
                mt,
            )
    return row


def record_receiving_movement(
    db: Session,
    *,
    doc: StockDocument,
    line: StockDocumentItem,
    quantity: float,
    performed_by: Optional[AppUser],
    to_carrier_id: Optional[int] = None,
    serial_number: Optional[str] = None,
) -> Optional[WarehouseInventoryMovement]:
    wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
    pid = getattr(line, "product_id", None)
    if wh_id < 1 or pid is None:
        return None
    bucket = disposition_to_inventory_bucket(stock_disposition_for_document_line(line))
    # Saleable receipt lands in receiving dock first.
    if bucket == BUCKET_SELLABLE:
        bucket = BUCKET_RECEIVING
    doc_type = (getattr(doc, "document_type", None) or "PZ").strip().upper()
    op_id = int(performed_by.id) if performed_by is not None else None
    bn = (getattr(line, "batch_number", None) or "").strip() or None
    ed = getattr(line, "expiry_date", None)
    return record_inventory_movement(
        db,
        tenant_id=int(doc.tenant_id),
        warehouse_id=wh_id,
        product_id=int(pid),
        movement_type=MOVEMENT_RECEIVING,
        quantity=float(quantity),
        inventory_bucket=bucket,
        operator_admin_id=op_id,
        source_document_type=doc_type,
        source_document_id=int(doc.id),
        source_line_id=int(line.id),
        from_location_id=None,
        to_location_id=getattr(doc, "location_id", None),
        from_carrier_id=None,
        to_carrier_id=int(to_carrier_id) if to_carrier_id is not None else getattr(line, "warehouse_carrier_id", None),
        lot_number=bn,
        serial_number=serial_number,
        expiry_date=ed if ed is not None and ed.year < 9999 else None,
        metadata={"from_bucket": None, "to_bucket": bucket},
    )


def record_putaway_movement(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    line: StockDocumentItem,
    doc: StockDocument,
    quantity: float,
    performed_by: AppUser,
    from_location_id: Optional[int],
    to_location_id: int,
    from_carrier_id: Optional[int] = None,
    to_carrier_id: Optional[int] = None,
    batch_number: Optional[str] = None,
    expiry_date: Optional[date] = None,
) -> WarehouseInventoryMovement:
    bucket = disposition_to_inventory_bucket(stock_disposition_for_document_line(line))
    doc_type = (getattr(doc, "document_type", None) or "PZ").strip().upper()
    return record_inventory_movement(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(line.product_id),
        movement_type=MOVEMENT_PUTAWAY,
        quantity=float(quantity),
        inventory_bucket=bucket,
        operator_admin_id=int(performed_by.id),
        source_document_type=doc_type,
        source_document_id=int(doc.id),
        source_line_id=int(line.id),
        from_location_id=from_location_id,
        to_location_id=int(to_location_id),
        from_carrier_id=from_carrier_id,
        to_carrier_id=to_carrier_id,
        lot_number=batch_number,
        expiry_date=expiry_date if expiry_date is not None and expiry_date.year < 9999 else None,
        metadata={"from_bucket": BUCKET_RECEIVING, "to_bucket": bucket},
    )


def record_damage_movement(
    db: Session,
    *,
    doc: StockDocument,
    from_line: StockDocumentItem,
    to_line: StockDocumentItem,
    quantity: float,
    performed_by: AppUser,
    from_carrier_id: Optional[int] = None,
) -> WarehouseInventoryMovement:
    wh_id = int(getattr(doc, "warehouse_id", 0) or 0)
    return record_inventory_movement(
        db,
        tenant_id=int(doc.tenant_id),
        warehouse_id=wh_id,
        product_id=int(from_line.product_id),
        movement_type=MOVEMENT_DAMAGE,
        quantity=float(quantity),
        inventory_bucket=BUCKET_DAMAGED,
        operator_admin_id=int(performed_by.id),
        source_document_type=(getattr(doc, "document_type", None) or "PZ").strip().upper(),
        source_document_id=int(doc.id),
        source_line_id=int(to_line.id),
        from_location_id=getattr(doc, "location_id", None),
        to_location_id=getattr(doc, "location_id", None),
        from_carrier_id=from_carrier_id,
        to_carrier_id=None,
        lot_number=(getattr(to_line, "batch_number", None) or "").strip() or None,
        expiry_date=getattr(to_line, "expiry_date", None),
        metadata={
            "from_bucket": BUCKET_SELLABLE,
            "to_bucket": BUCKET_DAMAGED,
            "from_line_id": int(from_line.id),
        },
    )


def record_carrier_relocation_movement(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    product_id: int,
    quantity: float,
    performed_by: AppUser,
    from_carrier_id: int,
    to_carrier_id: Optional[int] = None,
    to_location_id: Optional[int] = None,
    source_document_type: Optional[str] = None,
    source_document_id: Optional[int] = None,
    source_line_id: Optional[int] = None,
    lot_number: Optional[str] = None,
    expiry_date: Optional[date] = None,
    inventory_bucket: str = BUCKET_SELLABLE,
) -> WarehouseInventoryMovement:
    return record_inventory_movement(
        db,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        product_id=int(product_id),
        movement_type=MOVEMENT_RELOCATION,
        quantity=float(quantity),
        inventory_bucket=inventory_bucket,
        operator_admin_id=int(performed_by.id),
        source_document_type=source_document_type,
        source_document_id=source_document_id,
        source_line_id=source_line_id,
        from_location_id=None,
        to_location_id=to_location_id,
        from_carrier_id=int(from_carrier_id),
        to_carrier_id=int(to_carrier_id) if to_carrier_id is not None else None,
        lot_number=lot_number,
        expiry_date=expiry_date,
        metadata={"carrier_relocation": True},
    )


def mirror_product_warehouse_operation(
    db: Session,
    op: WmsProductWarehouseOperation,
) -> Optional[WarehouseInventoryMovement]:
    """Dual-write from existing wms_product_warehouse_operations row."""
    mt = _PRODUCT_OP_TO_MOVEMENT.get((op.movement_type or "").strip().upper())
    if mt is None:
        return None
    bucket = BUCKET_SELLABLE
    meta: dict[str, Any] = {"mirrored_from": "wms_product_warehouse_operation", "legacy_movement_type": op.movement_type}
    if mt == MOVEMENT_RECEIVING:
        bucket = BUCKET_RECEIVING
        meta["from_bucket"] = None
        meta["to_bucket"] = BUCKET_RECEIVING
    elif mt == MOVEMENT_PUTAWAY:
        meta["from_bucket"] = BUCKET_RECEIVING
        meta["to_bucket"] = BUCKET_SELLABLE
    elif mt == MOVEMENT_PICK:
        bucket = BUCKET_RESERVED
        meta["from_bucket"] = BUCKET_SELLABLE
        meta["to_bucket"] = BUCKET_RESERVED
    doc_type = None
    doc_id = getattr(op, "stock_document_id", None)
    if doc_id:
        doc_type = "PZ"
    if getattr(op, "pick_id", None):
        doc_type = "PICK"
        doc_id = int(op.pick_id)
    try:
        return record_inventory_movement(
            db,
            tenant_id=int(op.tenant_id),
            warehouse_id=int(op.warehouse_id),
            product_id=int(op.product_id),
            movement_type=mt,
            quantity=float(op.quantity),
            inventory_bucket=bucket,
            operator_admin_id=int(op.admin_id),
            source_document_type=doc_type,
            source_document_id=int(doc_id) if doc_id is not None else None,
            source_line_id=None,
            from_location_id=getattr(op, "source_location_id", None),
            to_location_id=getattr(op, "target_location_id", None),
            lot_number=getattr(op, "batch_number", None),
            expiry_date=getattr(op, "expiry_date", None),
            created_at=getattr(op, "created_at", None),
            metadata=meta,
        )
    except Exception:
        _logger.exception("mirror_product_warehouse_operation failed product_id=%s", op.product_id)
        return None


def safe_record_receiving_movement(
    db: Session,
    **kwargs: Any,
) -> None:
    try:
        record_receiving_movement(db, **kwargs)
    except Exception:
        _logger.exception("record_receiving_movement failed")


def safe_record_putaway_movement(
    db: Session,
    **kwargs: Any,
) -> None:
    try:
        record_putaway_movement(db, **kwargs)
    except Exception:
        _logger.exception("record_putaway_movement failed")


def safe_record_damage_movement(
    db: Session,
    **kwargs: Any,
) -> None:
    try:
        record_damage_movement(db, **kwargs)
    except Exception:
        _logger.exception("record_damage_movement failed")


def safe_mirror_product_warehouse_operation(db: Session, op: WmsProductWarehouseOperation) -> None:
    try:
        mirror_product_warehouse_operation(db, op)
    except Exception:
        _logger.exception("mirror_product_warehouse_operation failed op_id=%s", getattr(op, "id", None))
