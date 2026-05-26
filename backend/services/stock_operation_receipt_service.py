"""Append-only RECEIPT operations (qty + unit_price_net) for weighted average purchase price on products."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Optional

from sqlalchemy import func

if TYPE_CHECKING:
    from ..models.app_user import AppUser
from sqlalchemy.orm import Session

from ..models.stock_document import StockDocument, StockDocumentItem
from ..models.stock_operation import STOCK_OP_RECEIPT, StockOperation
from .inventory_lot_keys import NO_EXPIRY_SENTINEL, normalize_batch_number
from .stock_disposition import stock_disposition_for_document_line

_logger = logging.getLogger(__name__)


def append_receipt_operation(
    db: Session,
    doc: StockDocument,
    line: StockDocumentItem,
    qty: float,
    *,
    serial_number: Optional[str] = None,
    performed_by: Optional["AppUser"] = None,
    skip_inventory_movement: bool = False,
) -> None:
    """Insert one RECEIPT row; qty is the received delta at line price (document line purchase_price_net)."""
    if qty <= 1e-12:
        return
    if getattr(line, "product_id", None) is None:
        # Warehouse materials use carton/packaging stock, not product RECEIPT operations.
        return
    bn_raw = getattr(line, "batch_number", None)
    bn = normalize_batch_number(bn_raw) if bn_raw else ""
    ed = getattr(line, "expiry_date", None)
    exp_op = None if ed is None or ed >= NO_EXPIRY_SENTINEL else ed
    bn_op = bn if bn else None
    price = getattr(line, "purchase_price_net", None)
    unit = float(price) if price is not None else None

    _logger.debug(
        "append_receipt_operation document_id=%s document_line_id=%s qty=%s",
        getattr(doc, "id", None),
        getattr(line, "id", None),
        qty,
    )

    sn_op = (serial_number or "").strip() or None
    db.add(
        StockOperation(
            document_id=doc.id,
            document_line_id=line.id,
            product_id=line.product_id,
            location_id=getattr(doc, "location_id", None),
            qty=float(qty),
            type=STOCK_OP_RECEIPT,
            batch=bn_op,
            expiry_date=exp_op,
            stock_disposition=stock_disposition_for_document_line(line),
            unit_price_net=unit,
            serial_number=sn_op,
        )
    )

    if not skip_inventory_movement:
        from .warehouse_inventory_movement_service import safe_record_receiving_movement

        safe_record_receiving_movement(
            db,
            doc=doc,
            line=line,
            quantity=float(qty),
            performed_by=performed_by,
            to_carrier_id=getattr(line, "warehouse_carrier_id", None),
            serial_number=sn_op,
        )


def receipt_qty_already_recorded(db: Session, document_line_id: int) -> float:
    v = (
        db.query(func.coalesce(func.sum(StockOperation.qty), 0.0))
        .filter(
            StockOperation.document_line_id == document_line_id,
            StockOperation.type == STOCK_OP_RECEIPT,
        )
        .scalar()
    )
    return float(v or 0.0)


def backfill_receipt_gap_for_line(
    db: Session,
    doc: StockDocument,
    line: StockDocumentItem,
    target_received: float,
) -> None:
    """If RECEIPT sum < target_received, append one RECEIPT for the gap (e.g. accept without prior deltas)."""
    rec = float(target_received or 0)
    if rec <= 1e-12:
        return
    already = receipt_qty_already_recorded(db, line.id)
    gap = rec - already
    if gap > 1e-5:
        append_receipt_operation(db, doc, line, gap)
