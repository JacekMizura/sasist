"""Reklamacja → Z-PZ: wspólny pipeline magazynowy ze zwrotami (RMZ).

Towar trafia na Z-PZ dopiero po fizycznym odbiorze (QUARANTINE).
Po decyzji reklamacyjnej aktualizujemy stock_disposition na powiązanej linii dokumentu.
"""

from __future__ import annotations

import logging
from datetime import date, datetime
from typing import Optional

from sqlalchemy.orm import Session

from ...models.complaint import Complaint
from ...models.complaint_line import ComplaintLine
from ...models.order_item import OrderItem
from ...models.product import Product
from ...models.stock_document import StockDocument, StockDocumentItem
from ...models.stock_document_complaint_link import StockDocumentComplaintLink
from ..returns.collective_z_pz_service import find_or_create_collective_z_pz_for_warehouse
from ..returns.z_pz_constants import Z_PZ
from ..rmz_return_receipt_service import (
    _order_item_pricing,
    _resolve_z_pz_series,
    assign_return_receipt_document_number,
)
from ..stock_disposition import (
    STOCK_DISPOSITION_OUTLET_B,
    STOCK_DISPOSITION_QUARANTINE,
    STOCK_DISPOSITION_REJECTED_STOCK,
    STOCK_DISPOSITION_SALEABLE,
    STOCK_DISPOSITION_SERVICE_C,
)
from ..stock_document_service import recompute_putaway_status_for_document
from ..stock_operation_receipt_service import append_receipt_operation

logger = logging.getLogger(__name__)

COMPLAINT_RETURN_DECISION_QUARANTINE = "COMPLAINT_Q"


def complaint_line_receipt_posted(db: Session, complaint_line_id: int) -> bool:
    hit = (
        db.query(StockDocumentItem.id)
        .filter(StockDocumentItem.source_complaint_line_id == int(complaint_line_id))
        .first()
    )
    return hit is not None


def _existing_receipt_item_for_line(db: Session, complaint_line_id: int) -> Optional[StockDocumentItem]:
    return (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.source_complaint_line_id == int(complaint_line_id))
        .order_by(StockDocumentItem.id.asc())
        .first()
    )


def _ensure_complaint_link(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    stock_document_id: int,
    complaint_id: int,
) -> StockDocumentComplaintLink:
    existing = (
        db.query(StockDocumentComplaintLink)
        .filter(
            StockDocumentComplaintLink.stock_document_id == int(stock_document_id),
            StockDocumentComplaintLink.complaint_id == int(complaint_id),
        )
        .first()
    )
    if existing is not None:
        return existing
    row = StockDocumentComplaintLink(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        stock_document_id=int(stock_document_id),
        complaint_id=int(complaint_id),
        created_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def _link_complaint_to_document(db: Session, complaint: Complaint, doc: StockDocument) -> None:
    complaint.warehouse_document_id = int(doc.id)
    complaint.warehouse_document_type = Z_PZ
    _ensure_complaint_link(
        db,
        tenant_id=int(complaint.tenant_id),
        warehouse_id=int(complaint.warehouse_id),
        stock_document_id=int(doc.id),
        complaint_id=int(complaint.id),
    )


def disposition_for_complaint_line_decision(
    line: ComplaintLine,
    *,
    complaint: Optional[Complaint] = None,
) -> Optional[str]:
    """Mapowanie decyzji reklamacyjnej → stock_disposition (None = bez zmiany)."""
    dec = str(getattr(line, "line_decision", None) or "").strip().lower()
    if not dec:
        return None
    if dec == "reject":
        return STOCK_DISPOSITION_REJECTED_STOCK
    if dec == "repair":
        return STOCK_DISPOSITION_SERVICE_C
    op = ""
    if complaint is not None:
        op = str(getattr(complaint, "operational_decision", None) or "").strip().lower()
    if op == "outlet":
        return STOCK_DISPOSITION_OUTLET_B
    if dec in ("exchange", "refund"):
        return STOCK_DISPOSITION_SALEABLE
    return None


def sync_complaint_line_disposition_from_decision(
    db: Session,
    line: ComplaintLine,
    *,
    complaint: Complaint,
) -> bool:
    """Po decyzji — aktualizuj stock_disposition powiązanej linii Z-PZ."""
    target = disposition_for_complaint_line_decision(line, complaint=complaint)
    if target is None:
        return False
    items = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.source_complaint_line_id == int(line.id))
        .all()
    )
    if not items:
        return False
    changed = False
    for row in items:
        cur = str(getattr(row, "stock_disposition", None) or "").strip().upper()
        if cur == target:
            continue
        row.stock_disposition = target
        row.return_disposition = target
        rd = str(getattr(row, "return_decision", None) or "").strip().upper()
        if target == STOCK_DISPOSITION_SALEABLE:
            row.return_decision = "ACCEPTED"
        elif target == STOCK_DISPOSITION_OUTLET_B:
            row.return_decision = "DAMAGED_B"
        elif target == STOCK_DISPOSITION_SERVICE_C:
            row.return_decision = "DAMAGED_C"
        elif target == STOCK_DISPOSITION_REJECTED_STOCK and not rd:
            row.return_decision = "REJECTED"
        changed = True
    if changed:
        db.flush()
        doc_ids = {int(x.document_id) for x in items if getattr(x, "document_id", None)}
        for did in doc_ids:
            doc = db.query(StockDocument).filter(StockDocument.id == did).first()
            if doc is None:
                continue
            doc_lines = (
                db.query(StockDocumentItem)
                .filter(StockDocumentItem.document_id == did)
                .all()
            )
            recompute_putaway_status_for_document(doc, doc_lines, db=db)
    return changed


def receive_complaint_line_at_warehouse(
    db: Session,
    complaint: Complaint,
    line: ComplaintLine,
) -> StockDocument:
    """
    Fizyczny odbiór towaru reklamacyjnego — dopisuje linię do Z-PZ (QUARANTINE).
    Idempotentne po source_complaint_line_id.
    """
    tenant_id = int(complaint.tenant_id)
    wh_id = int(complaint.warehouse_id)
    cid = int(complaint.id)
    lid = int(line.id)

    existing_item = _existing_receipt_item_for_line(db, lid)
    if existing_item is not None:
        doc = db.query(StockDocument).filter(StockDocument.id == int(existing_item.document_id)).first()
        if doc is None:
            raise ValueError("Powiązany dokument Z-PZ nie istnieje.")
        _link_complaint_to_document(db, complaint, doc)
        logger.info("[Z-PZ] complaint receipt idempotent complaint_id=%s line_id=%s doc_id=%s", cid, lid, doc.id)
        return doc

    oi = line.order_item
    if oi is None and line.order_item_id:
        oi = db.query(OrderItem).filter(OrderItem.id == int(line.order_item_id)).first()
    if oi is None or not getattr(oi, "product_id", None):
        raise ValueError("Brak produktu na pozycji reklamacji — nie można utworzyć Z-PZ.")

    pid = int(oi.product_id)
    p = db.query(Product).filter(Product.id == pid, Product.tenant_id == tenant_id).first()
    if p is None:
        raise ValueError(f"Produkt {pid} nie znaleziony dla tenant_id={tenant_id}.")

    try:
        qty = max(1, int(line.quantity or 1))
    except (TypeError, ValueError):
        qty = 1

    series = _resolve_z_pz_series(db, tenant_id, wh_id)
    doc = find_or_create_collective_z_pz_for_warehouse(
        db,
        tenant_id=tenant_id,
        warehouse_id=wh_id,
        series=series,
    )

    unit_price, vat = _order_item_pricing(db, int(oi.id))
    disposition = STOCK_DISPOSITION_QUARANTINE

    row = StockDocumentItem(
        document_id=int(doc.id),
        delivery_item_id=None,
        product_id=pid,
        wm_kind=None,
        wm_id=None,
        ordered_quantity=float(qty),
        received_quantity=float(qty),
        quantity=float(qty),
        purchase_price_net=unit_price,
        vat_rate=float(vat),
        batch_number="",
        expiry_date=date(9999, 12, 31),
        return_disposition=disposition,
        stock_disposition=disposition,
        source_complaint_id=cid,
        source_complaint_line_id=lid,
        return_decision=COMPLAINT_RETURN_DECISION_QUARANTINE,
    )
    db.add(row)
    db.flush()
    append_receipt_operation(db, doc, row, float(qty))

    _link_complaint_to_document(db, complaint, doc)
    if not str(getattr(doc, "document_number", None) or "").strip():
        assign_return_receipt_document_number(db, doc, series=series)

    doc_lines = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id == int(doc.id))
        .all()
    )
    recompute_putaway_status_for_document(doc, doc_lines, db=db)

    logger.info(
        "[Z-PZ] complaint receipt complaint_id=%s line_id=%s doc_id=%s item_id=%s qty=%s",
        cid,
        lid,
        doc.id,
        row.id,
        qty,
    )
    return doc
