"""List issued sale documents (FV/PA) — canonical mapper only."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ..models.customer import Customer
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.sale_document import SaleDocument
from .sale_document_mapper import map_sale_document


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
        .options(joinedload(Order.items).joinedload(OrderItem.product))
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
        out.append(
            map_sale_document(
                db,
                doc=doc,
                order=order,
                customer=customer,
                mode="list",
            )
        )
    return out
