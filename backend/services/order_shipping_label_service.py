"""
SSOT: czy zamówienie ma aktualny list przewozowy.

Źródła (oba mapują na ``OrderDocument`` typu LIST_PRZEWOZOWY):
- sekcja „Listy przewozowe” / upload dokumentów zamówienia,
- pole dodatkowe typu SHIPPING_LABEL (sync do order_documents).

Nie porównujemy po nazwie pola tekstowego — tylko po typie dokumentu + niepusty ``file_url``.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.order import Order
from ..models.order_document import OrderDocument
from ..models.order_document_type_enum import OrderDocumentType


def list_active_shipping_label_documents(db: Session, order: Order) -> list[OrderDocument]:
    """Aktywne listy: LIST_PRZEWOZOWY z niepustym ``file_url`` (najnowsze pierwsze)."""
    return [
        d
        for d in (
            db.query(OrderDocument)
            .filter(
                OrderDocument.order_id == int(order.id),
                OrderDocument.tenant_id == int(order.tenant_id),
                OrderDocument.warehouse_id == int(order.warehouse_id),
                OrderDocument.document_type == OrderDocumentType.LIST_PRZEWOZOWY.value,
            )
            .order_by(OrderDocument.id.desc())
            .all()
        )
        if str(getattr(d, "file_url", None) or "").strip()
    ]


def order_has_shipping_label(db: Session, order: Order) -> bool:
    """True gdy istnieje co najmniej jeden poprawny list przewozowy."""
    return len(list_active_shipping_label_documents(db, order)) > 0


# Public alias (API / produkcja): jedna nazwa SSOT.
has_shipping_label = order_has_shipping_label


def count_active_shipping_labels(db: Session, order: Order) -> int:
    return len(list_active_shipping_label_documents(db, order))
