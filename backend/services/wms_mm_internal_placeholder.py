"""Synthetic supplier + delivery so MM documents satisfy stock_documents FKs without a real inbound delivery."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.inbound_delivery import InboundDelivery
from ..models.supplier import Supplier

MM_INTERNAL_SUPPLIER_NAME = "PZ PRODUCENT"
MM_INTERNAL_DELIVERY_NAME = "PZ DOSTAWCA"


def get_or_create_mm_placeholder_fks(db: Session, tenant_id: int) -> tuple[int, int]:
    """
    One inactive supplier + one shell delivery per tenant for document_type=MM.
    Returns (supplier_id, delivery_id).
    """
    d = (
        db.query(InboundDelivery)
        .filter(
            InboundDelivery.tenant_id == int(tenant_id),
            InboundDelivery.name == MM_INTERNAL_DELIVERY_NAME,
        )
        .first()
    )
    if d is not None:
        return int(d.supplier_id), int(d.id)

    s = (
        db.query(Supplier)
        .filter(Supplier.tenant_id == int(tenant_id), Supplier.name == MM_INTERNAL_SUPPLIER_NAME)
        .first()
    )
    if s is None:
        s = Supplier(tenant_id=int(tenant_id), name=MM_INTERNAL_SUPPLIER_NAME, active=False)
        db.add(s)
        db.flush()

    d = InboundDelivery(
        tenant_id=int(tenant_id),
        supplier_id=int(s.id),
        name=MM_INTERNAL_DELIVERY_NAME,
        status="received",
    )
    db.add(d)
    db.flush()
    return int(s.id), int(d.id)
