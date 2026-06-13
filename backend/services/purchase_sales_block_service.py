"""Update sales block fields on purchase PZ lines (commercial overlay)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.stock_document import StockDocument, StockDocumentItem
from ..schemas.purchase_sales_block import PatchPurchaseSalesBlockBody
from .commercial_availability_service import is_purchase_pz_line
from .purchase_sales_block_constants import (
    SALES_BLOCK_REASON_CODES,
    SALES_BLOCK_REASON_OTHER,
    PURCHASE_PZ_DOCUMENT_TYPE,
)
from .stock_document_service import build_stock_document_read


class PurchaseSalesBlockError(ValueError):
    pass


_EPS = 1e-9


def _validate_sales_block(
    *,
    received_quantity: float,
    sales_blocked_qty: float,
    reason_code: Optional[str],
    note: Optional[str],
) -> None:
    recv = float(received_quantity or 0)
    blocked = float(sales_blocked_qty or 0)
    if blocked < -_EPS:
        raise PurchaseSalesBlockError("sales_blocked_qty must be >= 0")
    if blocked - recv > 1e-9:
        raise PurchaseSalesBlockError("sales_blocked_qty cannot exceed received_quantity")
    if blocked > 1e-9:
        code = (reason_code or "").strip().upper()
        if code not in SALES_BLOCK_REASON_CODES:
            raise PurchaseSalesBlockError(f"Invalid sales_block_reason_code: {reason_code}")
        if code == SALES_BLOCK_REASON_OTHER and len((note or "").strip()) < 3:
            raise PurchaseSalesBlockError("sales_block_note is required (min. 3 chars) when reason is OTHER")


def patch_purchase_line_sales_block(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    line_id: int,
    body: PatchPurchaseSalesBlockBody,
    user: AppUser | None = None,
):
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(document_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        raise PurchaseSalesBlockError("Document not found")
    if str(getattr(doc, "document_type", "") or "").strip().upper() != PURCHASE_PZ_DOCUMENT_TYPE:
        raise PurchaseSalesBlockError("Sales block applies only to purchase PZ documents")

    line = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.id == int(line_id), StockDocumentItem.document_id == int(document_id))
        .first()
    )
    if not line or not is_purchase_pz_line(doc, line):
        raise PurchaseSalesBlockError("Line not found or not a catalog product line on purchase PZ")

    recv = float(line.received_quantity or 0)
    blocked = float(body.sales_blocked_qty if body.sales_blocked_qty is not None else getattr(line, "sales_blocked_qty", 0) or 0)
    reason = body.sales_block_reason_code if body.sales_block_reason_code is not None else getattr(line, "sales_block_reason_code", None)
    note = body.sales_block_note if body.sales_block_note is not None else getattr(line, "sales_block_note", None)

    if blocked <= _EPS:
        blocked = 0.0
        reason = None
        note = None

    _validate_sales_block(
        received_quantity=recv,
        sales_blocked_qty=blocked,
        reason_code=reason,
        note=note,
    )

    line.sales_blocked_qty = blocked
    line.sales_block_reason_code = (str(reason).strip().upper() if reason else None)
    line.sales_block_note = (str(note).strip() if note else None)
    if blocked > _EPS:
        line.sales_blocked_at = datetime.utcnow()
        line.sales_blocked_by_user_id = int(user.id) if user is not None and getattr(user, "id", None) else None
    else:
        line.sales_blocked_at = None
        line.sales_blocked_by_user_id = None

    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return build_stock_document_read(db, doc)
