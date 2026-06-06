"""Append-only ISSUE operations for WZ warehouse documents."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from sqlalchemy.orm import Session

from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_ISSUE, StockOperation
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .stock_disposition import stock_disposition_for_document_line
from .warehouse_inventory_movement_service import (
    BUCKET_SELLABLE,
    MOVEMENT_ISSUE,
    record_inventory_movement,
)

if TYPE_CHECKING:
    from ..models.app_user import AppUser

_logger = logging.getLogger(__name__)


def append_issue_operation(
    db: Session,
    doc: StockDocument,
    line: StockDocumentItem,
    qty: float,
    *,
    from_location_id: int,
    batch_number: str = "",
    expiry_date=None,
    performed_by: Optional["AppUser"] = None,
    operator_admin_id: int | None = None,
    metadata: dict | None = None,
) -> StockOperation:
    """Insert one ISSUE row and record warehouse inventory movement tied to WZ."""
    if qty <= 1e-12:
        raise ValueError("issue qty must be positive")
    if getattr(line, "product_id", None) is None:
        raise ValueError("issue line requires product_id")

    bn = normalize_batch_number(batch_number) if batch_number else ""
    ed = expiry_date
    exp_op = None if ed is None or ed >= NO_EXPIRY_SENTINEL else ed
    bn_op = bn if bn else None
    op_admin = operator_admin_id
    if op_admin is None and performed_by is not None:
        op_admin = int(getattr(performed_by, "id", 0) or 0) or None

    op = StockOperation(
        document_id=int(doc.id),
        document_line_id=int(line.id),
        product_id=int(line.product_id),
        location_id=int(from_location_id),
        qty=float(qty),
        type=STOCK_OP_ISSUE,
        batch=bn_op,
        expiry_date=exp_op,
        stock_disposition=stock_disposition_for_document_line(line),
    )
    db.add(op)
    db.flush()

    mov = record_inventory_movement(
        db,
        tenant_id=int(doc.tenant_id),
        warehouse_id=int(doc.warehouse_id or 0),
        product_id=int(line.product_id),
        movement_type=MOVEMENT_ISSUE,
        quantity=float(qty),
        inventory_bucket=BUCKET_SELLABLE,
        operator_admin_id=op_admin,
        source_document_type="WZ",
        source_document_id=int(doc.id),
        source_line_id=int(line.id),
        from_location_id=int(from_location_id),
        lot_number=bn_op,
        expiry_date=exp_op,
        metadata={
            "stock_operation_id": int(op.id),
            "stock_document_id": int(doc.id),
            **(metadata or {}),
        },
    )
    _logger.debug(
        "append_issue_operation document_id=%s line_id=%s qty=%s movement_id=%s",
        doc.id,
        line.id,
        qty,
        getattr(mov, "id", None),
    )
    return op
