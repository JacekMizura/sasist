"""Sale document detail — canonical mapper only."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session, joinedload

from ..models.customer import Customer
from ..models.order import Order
from ..models.order_item import OrderItem
from ..models.sale_document import SaleDocument
from .sale_document_mapper import map_sale_document


def get_sale_document_detail(
    db: Session,
    *,
    tenant_id: int,
    document_id: str,
) -> dict[str, Any] | None:
    row = (
        db.query(SaleDocument, Order, Customer)
        .join(Order, Order.id == SaleDocument.order_id)
        .outerjoin(Customer, Customer.id == Order.customer_id)
        .options(joinedload(Order.items).joinedload(OrderItem.product))
        .filter(
            SaleDocument.id == str(document_id).strip(),
            SaleDocument.tenant_id == int(tenant_id),
        )
        .first()
    )
    if row is None:
        return None
    doc, order, customer = row
    return map_sale_document(db, doc=doc, order=order, customer=customer, mode="detail")
