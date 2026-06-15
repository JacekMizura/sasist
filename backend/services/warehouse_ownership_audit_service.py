"""P2.3 — read-only audit of NULL warehouse_id on purchase chain entities."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

_logger = logging.getLogger(__name__)


def count_missing_warehouse_ownership(db: Session) -> dict[str, int]:
    from ..models.inbound_delivery import InboundDelivery
    from ..models.purchase_order import PurchaseOrder
    from ..models.stock_document import StockDocument

    po_null = int(
        db.query(func.count(PurchaseOrder.id))
        .filter(PurchaseOrder.warehouse_id.is_(None))
        .scalar()
        or 0
    )
    delivery_null = int(
        db.query(func.count(InboundDelivery.id))
        .filter(InboundDelivery.warehouse_id.is_(None))
        .scalar()
        or 0
    )
    stock_null = int(
        db.query(func.count(StockDocument.id))
        .filter(StockDocument.warehouse_id.is_(None))
        .scalar()
        or 0
    )
    return {
        "purchase_orders_without_warehouse": po_null,
        "deliveries_without_warehouse": delivery_null,
        "stock_documents_without_warehouse": stock_null,
    }


def log_warehouse_ownership_audit(db: Session) -> dict[str, int]:
    counts = count_missing_warehouse_ownership(db)
    _logger.warning(
        "[WAREHOUSE_OWNERSHIP_AUDIT] purchase_orders_without_warehouse=%s "
        "deliveries_without_warehouse=%s stock_documents_without_warehouse=%s",
        counts["purchase_orders_without_warehouse"],
        counts["deliveries_without_warehouse"],
        counts["stock_documents_without_warehouse"],
    )
    return counts


def missing_ownership_rows(db: Session) -> list[dict[str, Any]]:
    """Rows for CSV export — legacy records only."""
    from ..models.inbound_delivery import InboundDelivery
    from ..models.purchase_order import PurchaseOrder
    from ..models.stock_document import StockDocument

    out: list[dict[str, Any]] = []
    for po in db.query(PurchaseOrder).filter(PurchaseOrder.warehouse_id.is_(None)).order_by(PurchaseOrder.id).all():
        out.append(
            {
                "entity_type": "purchase_order",
                "entity_id": int(po.id),
                "tenant_id": int(po.tenant_id),
                "warehouse_id": None,
                "linked_po_id": None,
                "linked_delivery_id": None,
                "document_type": None,
                "created_at": getattr(po, "created_at", None),
            }
        )
    for d in (
        db.query(InboundDelivery)
        .filter(InboundDelivery.warehouse_id.is_(None))
        .order_by(InboundDelivery.id)
        .all()
    ):
        out.append(
            {
                "entity_type": "delivery",
                "entity_id": int(d.id),
                "tenant_id": int(d.tenant_id),
                "warehouse_id": None,
                "linked_po_id": getattr(d, "purchase_order_id", None),
                "linked_delivery_id": None,
                "document_type": None,
                "created_at": getattr(d, "created_at", None),
            }
        )
    for doc in (
        db.query(StockDocument)
        .filter(StockDocument.warehouse_id.is_(None))
        .order_by(StockDocument.id)
        .all()
    ):
        out.append(
            {
                "entity_type": "stock_document",
                "entity_id": int(doc.id),
                "tenant_id": int(doc.tenant_id),
                "warehouse_id": None,
                "linked_po_id": None,
                "linked_delivery_id": getattr(doc, "delivery_id", None),
                "document_type": str(getattr(doc, "document_type", "") or ""),
                "created_at": getattr(doc, "created_at", None),
            }
        )
    return out
