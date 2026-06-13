"""Read-side projection of purchase PZ sales-block fields (no stock_document_service import)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.stock_document import StockDocument, StockDocumentItem
from .commercial_availability_service import is_purchase_pz_line, line_commercial_states_for_product
from .purchase_sales_block_constants import SALES_BLOCK_REASON_LABELS


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
