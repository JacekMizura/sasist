"""P2.5A — canonical warehouse + purchase workflow statuses for PZ (independent axes)."""

from __future__ import annotations

from typing import Iterable, Optional

from sqlalchemy.orm import Session

from ..models.stock_document import StockDocument, StockDocumentItem
from .stock_document_service import (
    _doc_status_lower,
    compute_is_fully_putaway_for_items,
    compute_is_fully_received_for_items,
    is_stock_document_cancelled,
)

# Warehouse workflow (operational)
WH_NEW = "NEW"
WH_COUNTING = "COUNTING"
WH_COUNTED = "COUNTED"
WH_PUTAWAY_IN_PROGRESS = "PUTAWAY_IN_PROGRESS"
WH_PUTAWAY_COMPLETED = "PUTAWAY_COMPLETED"
WH_CLOSED = "CLOSED"

WAREHOUSE_WORKFLOW_STATUSES = frozenset(
    {
        WH_NEW,
        WH_COUNTING,
        WH_COUNTED,
        WH_PUTAWAY_IN_PROGRESS,
        WH_PUTAWAY_COMPLETED,
        WH_CLOSED,
    }
)

# Purchase / cost workflow (financial — does not gate receiving or putaway)
PU_PENDING_INVOICE = "PENDING_INVOICE"
PU_COST_REVIEW = "COST_REVIEW"
PU_COST_DISPUTE = "COST_DISPUTE"
PU_VERIFIED = "VERIFIED"

PURCHASE_WORKFLOW_STATUSES = frozenset(
    {
        PU_PENDING_INVOICE,
        PU_COST_REVIEW,
        PU_COST_DISPUTE,
        PU_VERIFIED,
    }
)

_WMS_RECEIPT_TYPES = frozenset({"PZ", "Z_PZ", "PZ_RT", "RETURN_RECEIPT", "MM"})

_EPS = 1e-5


def normalize_warehouse_workflow_status(raw: str | None) -> str:
    key = str(raw or WH_NEW).strip().upper()
    return key if key in WAREHOUSE_WORKFLOW_STATUSES else WH_NEW


def normalize_purchase_workflow_status(raw: str | None) -> str:
    key = str(raw or PU_PENDING_INVOICE).strip().upper()
    return key if key in PURCHASE_WORKFLOW_STATUSES else PU_PENDING_INVOICE


def is_purchase_workflow_document(doc: StockDocument) -> bool:
    """Purchase cost axis applies to supplier PZ only (not return Z-PZ)."""
    dt = str(getattr(doc, "document_type", "") or "").strip().upper()
    if dt != "PZ":
        return False
    if getattr(doc, "rmz_id", None) is not None:
        return False
    return True


def derive_warehouse_workflow_status(
    doc: StockDocument,
    item_rows: Iterable[StockDocumentItem],
    db: Session | None = None,
    *,
    full_recv: Optional[bool] = None,
    full_put: Optional[bool] = None,
) -> str:
    """Map legacy receiving/putaway/relocation fields → P2.5A warehouse workflow status."""
    if is_stock_document_cancelled(doc):
        return WH_CLOSED

    rows = list(item_rows)
    # full_recv kept in signature for callers; receiving close is rs=DONE only.
    if full_recv is None:
        full_recv = compute_is_fully_received_for_items(rows)
    _ = full_recv
    if full_put is None:
        full_put = compute_is_fully_putaway_for_items(db, rows) if db is not None else False

    st = _doc_status_lower(doc)
    rs = str(getattr(doc, "receiving_status", "") or "").strip().upper()
    ps = str(getattr(doc, "putaway_status", "") or "").strip().upper()
    rls = str(getattr(doc, "relocation_status", "") or "").strip().upper()

    any_rec = any(float(r.received_quantity or 0) > _EPS for r in rows)
    any_put = any(float(getattr(r, "quantity_putaway", 0) or 0) > _EPS for r in rows)

    if st in ("posted", "zakonczone", "closed", "completed"):
        return WH_CLOSED

    if rls == "DONE" or (rs == "DONE" and full_put):
        if st in ("zakonczone", "posted", "closed"):
            return WH_CLOSED
        return WH_PUTAWAY_COMPLETED

    if ps == "IN_PROGRESS" or (any_put and not full_put):
        return WH_PUTAWAY_IN_PROGRESS

    # COUNTED only after explicit receiving finish — not when actual >= expected.
    if rs == "DONE":
        return WH_COUNTED

    if rs in ("IN_PROGRESS", "COUNTING") or any_rec:
        return WH_COUNTING

    return WH_NEW


def sync_warehouse_workflow_status(
    doc: StockDocument,
    item_rows: Iterable[StockDocumentItem],
    db: Session | None = None,
    *,
    full_recv: Optional[bool] = None,
    full_put: Optional[bool] = None,
) -> bool:
    """Persist derived warehouse_workflow_status when changed."""
    dt = str(getattr(doc, "document_type", "") or "").strip().upper()
    if dt not in _WMS_RECEIPT_TYPES:
        return False
    derived = derive_warehouse_workflow_status(
        doc,
        item_rows,
        db,
        full_recv=full_recv,
        full_put=full_put,
    )
    current = normalize_warehouse_workflow_status(getattr(doc, "warehouse_workflow_status", None))
    if current == derived:
        return False
    doc.warehouse_workflow_status = derived
    return True


def backfill_warehouse_workflow_statuses(db: Session, *, tenant_id: int | None = None) -> int:
    """Startup / migration helper — recalculate stored warehouse_workflow_status."""
    q = db.query(StockDocument).filter(StockDocument.document_type.in_(tuple(_WMS_RECEIPT_TYPES)))
    if tenant_id is not None:
        q = q.filter(StockDocument.tenant_id == int(tenant_id))
    updated = 0
    for doc in q.all():
        rows = (
            db.query(StockDocumentItem)
            .filter(StockDocumentItem.document_id == int(doc.id))
            .all()
        )
        if sync_warehouse_workflow_status(doc, rows, db):
            db.add(doc)
            updated += 1
    if updated:
        db.commit()
    return updated
