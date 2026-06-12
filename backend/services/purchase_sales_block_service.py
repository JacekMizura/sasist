"""Update sales block fields on purchase PZ lines (commercial overlay)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy.orm import Session

from ..models.app_user import AppUser
from ..models.stock_document import StockDocument, StockDocumentItem
from ..schemas.purchase_sales_block import PatchPurchaseSalesBlockBody
from .commercial_availability_service import is_purchase_pz_line, line_commercial_states_for_product
from .purchase_sales_block_constants import (
    SALES_BLOCK_REASON_CODES,
    SALES_BLOCK_REASON_OTHER,
    SALES_BLOCK_REASON_LABELS,
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


def sales_block_line_projection(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None,
    doc: StockDocument,
    line: StockDocumentItem,
) -> dict:
    wh_id = int(warehouse_id or getattr(doc, "warehouse_id", 0) or 0)
    blocked = max(0.0, float(getattr(line, "sales_blocked_qty", 0) or 0))
    recv = float(line.received_quantity or 0)
    reason_code = getattr(line, "sales_block_reason_code", None)
    effective = 0.0
    line_remaining = recv
    if wh_id > 0 and getattr(line, "product_id", None) is not None and is_purchase_pz_line(doc, line):
        states = line_commercial_states_for_product(
            db, tenant_id=int(tenant_id), warehouse_id=wh_id, product_id=int(line.product_id)
        )
        by_id = {s.line_id: s for s in states}
        st = by_id.get(int(line.id))
        if st:
            effective = st.effective_sales_block
            line_remaining = st.line_remaining_qty

    line_commercial_available = max(0.0, recv - effective)
    return {
        "sales_blocked_qty": blocked,
        "sales_block_effective_qty": effective,
        "sales_block_reason_code": reason_code,
        "sales_block_reason_label": SALES_BLOCK_REASON_LABELS.get(str(reason_code or "").strip().upper(), None),
        "sales_block_note": getattr(line, "sales_block_note", None),
        "sales_blocked_at": getattr(line, "sales_blocked_at", None),
        "sales_blocked_by_user_id": getattr(line, "sales_blocked_by_user_id", None),
        "line_commercial_available_qty": line_commercial_available,
        "line_remaining_qty": line_remaining,
    }
