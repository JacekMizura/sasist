"""List issued sale documents (FV/PA) for Dokumenty sprzedaży."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.customer import Customer
from ..models.order import Order
from ..models.sale_document import SaleDocument


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
                "net": float(order.value or 0) if order else 0.0,
                "gross": float(order.value or 0) if order else 0.0,
                "payment_method": None,
                "paid": True,
                "external_status": "NOWE",
                "source": str(order.source or "") if order else None,
                "panel_document_type": panel_type,
            }
        )
    return out
