"""
Single place to derive purchase order status from linked inbound deliveries + PZ (stock_documents).

Maps warehouse reality onto PO.status (overrides stale Draft when receipts exist).
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.inbound_delivery import DeliveryItem, InboundDelivery
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ..models.stock_document import StockDocument, StockDocumentItem

# Align with purchasing_order_service literals (avoid importing that module → cycles).
PO_DRAFT = "Draft"
PO_SENT = "Sent"
PO_CONFIRMED = "Confirmed"
PO_PARTIALLY_RECEIVED = "PartiallyReceived"
PO_DELIVERED = "Delivered"
PO_CLOSED = "Closed"
PO_CANCELLED = "Cancelled"

EPS = 1e-5


def derive_purchase_order_status_from_warehouse(db: Session, tenant_id: int, purchase_order_id: int) -> Optional[str]:
    """
    Returns new PO.status string, or None if warehouse data should not drive status
    (no linked deliveries, cancelled PO, no measurable ordered qty on product lines).
    """
    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == int(purchase_order_id), PurchaseOrder.tenant_id == int(tenant_id))
        .first()
    )
    if not po or (po.status or "") == PO_CANCELLED:
        return None

    deliveries = (
        db.query(InboundDelivery)
        .filter(
            InboundDelivery.tenant_id == int(tenant_id),
            InboundDelivery.purchase_order_id == int(purchase_order_id),
        )
        .all()
    )
    if not deliveries:
        return None

    del_ids = [int(d.id) for d in deliveries]
    ordered_product = 0.0
    for di in db.query(DeliveryItem).filter(DeliveryItem.delivery_id.in_(del_ids)):
        if di.product_id is None:
            continue
        ordered_product += float(di.quantity_ordered or 0)

    pzs = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.delivery_id.in_(del_ids),
            StockDocument.document_type == "PZ",
        )
        .all()
    )

    if ordered_product <= EPS:
        return None

    if not pzs:
        return PO_SENT

    received_product = 0.0
    fully_putaway = True
    doc_ids = [int(z.id) for z in pzs]
    lines = (
        db.query(StockDocumentItem)
        .filter(StockDocumentItem.document_id.in_(doc_ids))
        .order_by(StockDocumentItem.id)
        .all()
    )
    for ln in lines:
        if ln.product_id is None:
            continue
        rec = float(ln.received_quantity or 0)
        put = float(getattr(ln, "quantity_putaway", 0) or 0)
        received_product += rec
        if rec > EPS and put + EPS < rec:
            fully_putaway = False

    if received_product <= EPS:
        return PO_SENT
    if received_product + EPS < ordered_product:
        return PO_PARTIALLY_RECEIVED
    if not fully_putaway:
        return PO_DELIVERED
    return PO_CLOSED


def _touch_po_timestamps(po: PurchaseOrder, new_status: str, now: datetime) -> None:
    if new_status == PO_SENT and getattr(po, "sent_at", None) is None:
        po.sent_at = now
    if new_status in (PO_PARTIALLY_RECEIVED, PO_DELIVERED, PO_CLOSED) and getattr(po, "confirmed_at", None) is None:
        po.confirmed_at = now
    if new_status == PO_CLOSED and getattr(po, "closed_at", None) is None:
        po.closed_at = now


def sync_purchase_order_status_for_po_id(db: Session, tenant_id: int, purchase_order_id: int) -> Optional[str]:
    """Applies derive_* when applicable. Returns new status if changed, else None. Caller commits."""
    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == int(purchase_order_id), PurchaseOrder.tenant_id == int(tenant_id))
        .first()
    )
    if not po:
        return None
    derived = derive_purchase_order_status_from_warehouse(db, tenant_id, purchase_order_id)
    if derived is None:
        return None
    cur = (po.status or "").strip()
    if cur == PO_CANCELLED:
        return None
    if derived == cur:
        return None
    now = datetime.utcnow()
    po.status = derived
    po.updated_at = now
    _touch_po_timestamps(po, derived, now)
    return derived


def sync_purchase_order_status_for_delivery_id(db: Session, tenant_id: int, delivery_id: int) -> Optional[str]:
    d = (
        db.query(InboundDelivery)
        .filter(InboundDelivery.id == int(delivery_id), InboundDelivery.tenant_id == int(tenant_id))
        .first()
    )
    if not d or d.purchase_order_id is None:
        return None
    return sync_purchase_order_status_for_po_id(db, tenant_id, int(d.purchase_order_id))


def sync_purchase_order_status_for_stock_document_id(db: Session, tenant_id: int, stock_document_id: int) -> Optional[str]:
    doc = (
        db.query(StockDocument)
        .filter(StockDocument.id == int(stock_document_id), StockDocument.tenant_id == int(tenant_id))
        .first()
    )
    if not doc:
        return None
    # Purchase-order sync follows supplier inbound deliveries only. RMZ return receipts (PZ_RT / RETURN_RECEIPT)
    # have no delivery_id and must not participate — avoid int(None) and keep domains separated.
    if doc.delivery_id is None:
        return None
    if (doc.document_type or "").strip() != "PZ":
        return None
    return sync_purchase_order_status_for_delivery_id(db, tenant_id, int(doc.delivery_id))


def run_purchasing_integrity_audit(db: Session, tenant_id: int) -> Dict[str, Any]:
    """Read-only checks for dirty purchasing / warehouse links."""
    issues: List[Dict[str, Any]] = []

    draft_po_with_pz: List[int] = []
    for po in (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.status == PO_DRAFT)
        .all()
    ):
        d_any = (
            db.query(InboundDelivery.id)
            .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.purchase_order_id == po.id)
            .first()
        )
        if not d_any:
            continue
        did = int(d_any[0])
        pz = db.query(StockDocument.id).filter(StockDocument.delivery_id == did, StockDocument.document_type == "PZ").first()
        if pz:
            draft_po_with_pz.append(int(po.id))

    if draft_po_with_pz:
        issues.append(
            {
                "code": "draft_po_with_linked_pz",
                "count": len(draft_po_with_pz),
                "sample_ids": draft_po_with_pz[:50],
            }
        )

    null_po_line_product = (
        db.query(PurchaseOrderItem.id)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .filter(PurchaseOrder.tenant_id == tenant_id, PurchaseOrderItem.product_id.is_(None))
        .limit(200)
        .all()
    )
    if null_po_line_product:
        issues.append(
            {
                "code": "purchase_order_items_null_product_id",
                "count": len(null_po_line_product),
                "sample_ids": [int(r[0]) for r in null_po_line_product[:50]],
            }
        )

    null_oi_product = (
        db.query(OrderItem.id, OrderItem.order_id)
        .join(Order, Order.id == OrderItem.order_id)
        .filter(Order.tenant_id == tenant_id, OrderItem.product_id.is_(None))
        .limit(200)
        .all()
    )
    if null_oi_product:
        issues.append(
            {
                "code": "order_items_null_product_id",
                "count": len(null_oi_product),
                "sample": [{"order_item_id": int(a), "order_id": int(b)} for a, b in null_oi_product[:30]],
            }
        )

    orphan_po_items = (
        db.query(PurchaseOrderItem.id)
        .outerjoin(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .filter(PurchaseOrder.id.is_(None))
        .limit(100)
        .all()
    )
    if orphan_po_items:
        issues.append(
            {"code": "orphan_purchase_order_items", "count": len(orphan_po_items), "sample_ids": [int(r[0]) for r in orphan_po_items]}
        )

    zero_total_lines: List[int] = []
    for po in db.query(PurchaseOrder).filter(PurchaseOrder.tenant_id == tenant_id).all():
        tv = float(getattr(po, "total_value", 0) or 0)
        nlines = db.query(PurchaseOrderItem.id).filter(PurchaseOrderItem.purchase_order_id == po.id).count()
        if tv <= EPS and nlines > 0:
            zero_total_lines.append(int(po.id))
    if zero_total_lines:
        issues.append(
            {
                "code": "purchase_orders_zero_total_with_lines",
                "count": len(zero_total_lines),
                "sample_ids": zero_total_lines[:50],
            }
        )

    pz_no_supplier = (
        db.query(StockDocument.id)
        .filter(
            StockDocument.tenant_id == tenant_id,
            StockDocument.document_type == "PZ",
            StockDocument.supplier_id.is_(None),
        )
        .limit(50)
        .all()
    )
    if pz_no_supplier:
        issues.append(
            {"code": "pz_null_supplier_id", "count": len(pz_no_supplier), "sample_ids": [int(r[0]) for r in pz_no_supplier]}
        )

    dup_po_delivery = (
        db.query(InboundDelivery.purchase_order_id, func.count(InboundDelivery.id))
        .filter(InboundDelivery.tenant_id == tenant_id, InboundDelivery.purchase_order_id.isnot(None))
        .group_by(InboundDelivery.purchase_order_id)
        .having(func.count(InboundDelivery.id) > 1)
        .all()
    )
    if dup_po_delivery:
        issues.append(
            {
                "code": "multiple_deliveries_per_po",
                "rows": [{"purchase_order_id": int(a), "delivery_count": int(b)} for a, b in dup_po_delivery[:40]],
            }
        )

    return {"tenant_id": tenant_id, "issue_count": len(issues), "issues": issues}
