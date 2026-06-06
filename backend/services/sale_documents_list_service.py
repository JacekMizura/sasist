"""List issued sale documents (FV/PA) for Dokumenty sprzedaży."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ..models.commerce_operational import Payment
from ..models.customer import Customer
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.sale_document import SaleDocument
from .sale_document_financials import compute_sale_totals_from_order


def _payment_for_order(db: Session, order_id: int) -> Payment | None:
    return (
        db.query(Payment)
        .filter(Payment.order_id == int(order_id))
        .order_by(Payment.id.desc())
        .first()
    )


def _totals_for_doc(db: Session, doc: SaleDocument, order: Order) -> tuple[float, float, float]:
    if doc.total_net is not None and doc.total_gross is not None:
        return (
            float(doc.total_net),
            float(doc.total_gross),
            float(doc.total_vat or 0.0),
        )
    order_full = (
        db.query(Order)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(Order.id == int(order.id))
        .first()
    )
    if order_full is None:
        return 0.0, 0.0, 0.0
    if not order_full.items:
        gross = float(order_full.value or 0)
        return gross, gross, 0.0
    totals = compute_sale_totals_from_order(order_full)
    return float(totals["total_net"]), float(totals["total_gross"]), float(totals["total_vat"])


def list_sale_documents(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int | None = None,
    panel_document_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    lim = max(1, min(int(limit), 500))
    off = max(0, int(offset))
    q = (
        db.query(SaleDocument, Order, Customer)
        .join(Order, Order.id == SaleDocument.order_id)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .filter(SaleDocument.tenant_id == int(tenant_id))
        .order_by(SaleDocument.created_at.desc(), SaleDocument.id.desc())
    )
    if warehouse_id is not None:
        q = q.filter(SaleDocument.warehouse_id == int(warehouse_id))
    panel = (panel_document_type or "").strip().upper()
    if panel in ("PARAGON", "INVOICE"):
        q = q.filter(SaleDocument.panel_document_type == panel)
    rows = q.offset(off).limit(lim).all()
    out: list[dict] = []
    for doc, order, customer in rows:
        client = ""
        if customer is not None:
            client = str(customer.company_name or "").strip()
            if not client:
                client = " ".join(
                    p for p in (customer.first_name, customer.last_name) if p
                ).strip()
        if not client and order is not None:
            client = str(getattr(order, "customer_name", None) or "").strip()
        panel_type = str(doc.panel_document_type or "").upper()
        doc_type = "FV" if panel_type == "INVOICE" else "PA"
        net, gross, vat = _totals_for_doc(db, doc, order)
        pay_method = str(doc.payment_method or "").strip().upper() or None
        pay_status = str(doc.payment_status or "").strip().upper() or None
        if pay_method is None and order is not None:
            pay = _payment_for_order(db, int(order.id))
            if pay is not None:
                pay_method = str(pay.method or "").strip().upper() or None
                pay_status = str(pay.status or "").strip().upper() or None
        paid = pay_status in ("PAID", "SETTLED", "CAPTURED") or pay_status is None
        out.append(
            {
                "id": str(doc.id),
                "order_id": int(doc.order_id),
                "order_number": str(order.number or "") if order else None,
                "client": client or "—",
                "series": doc_type,
                "doc_type": doc_type,
                "document_number": str(doc.document_number or ""),
                "date": doc.created_at.isoformat() if doc.created_at else None,
                "net": net,
                "gross": gross,
                "vat": vat,
                "payment_method": pay_method,
                "payment_status": pay_status,
                "paid": paid,
                "external_status": "NOWE",
                "source": str(order.source or "") if order else None,
                "panel_document_type": panel_type,
                "document_subtype": str(doc.document_subtype or "").upper() or None,
                "detail_path": f"/documents/sales/{doc.id}",
            }
        )
    return out
