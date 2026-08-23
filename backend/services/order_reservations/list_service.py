"""List product business reservations (RZ) for product Magazyn UI."""

from __future__ import annotations

from sqlalchemy.orm import Session, joinedload

from ...models.order import Order
from ...models.order_warehouse_reservation import OrderWarehouseReservation
from ...models.product import Product
from ...models.stock_document import StockDocument
from ...models.warehouse import Warehouse
from .constants import (
    OWR_STATUS_CANCELLED,
    OWR_STATUS_CONSUMED,
    OWR_STATUS_PARTIALLY_CONSUMED,
    OWR_STATUS_RELEASED,
    OWR_STATUS_RESERVED,
)

_STATUS_PL = {
    OWR_STATUS_RESERVED: "Aktywna",
    OWR_STATUS_PARTIALLY_CONSUMED: "Częściowo zrealizowana",
    OWR_STATUS_CONSUMED: "Zrealizowana",
    OWR_STATUS_RELEASED: "Zwolniona",
    OWR_STATUS_CANCELLED: "Anulowana",
}


def list_product_business_reservations(
    db: Session,
    *,
    tenant_id: int,
    product_id: int,
    warehouse_id: int | None = None,
    include_inactive: bool = False,
    limit: int = 200,
) -> list[dict]:
    q = (
        db.query(OrderWarehouseReservation)
        .options(
            joinedload(OrderWarehouseReservation.order),
            joinedload(OrderWarehouseReservation.warehouse),
            joinedload(OrderWarehouseReservation.stock_document),
            joinedload(OrderWarehouseReservation.product),
        )
        .filter(
            OrderWarehouseReservation.tenant_id == int(tenant_id),
            OrderWarehouseReservation.product_id == int(product_id),
        )
    )
    if warehouse_id is not None:
        q = q.filter(OrderWarehouseReservation.warehouse_id == int(warehouse_id))
    if not include_inactive:
        q = q.filter(
            OrderWarehouseReservation.status.in_(
                (OWR_STATUS_RESERVED, OWR_STATUS_PARTIALLY_CONSUMED)
            )
        )
    rows = q.order_by(OrderWarehouseReservation.created_at.desc()).limit(int(limit)).all()
    out: list[dict] = []
    for r in rows:
        order: Order | None = r.order
        wh: Warehouse | None = r.warehouse
        doc: StockDocument | None = r.stock_document
        prod: Product | None = r.product
        out.append(
            {
                "id": int(r.id),
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "order_id": int(r.order_id),
                "order_number": getattr(order, "order_number", None) or getattr(order, "number", None) or str(r.order_id),
                "stock_document_id": int(r.stock_document_id) if r.stock_document_id else None,
                "document_number": (doc.document_number if doc else None),
                "product_id": int(r.product_id),
                "product_name": (prod.name if prod else None) or f"#{r.product_id}",
                "warehouse_id": int(r.warehouse_id),
                "warehouse_name": (wh.name if wh else None) or f"#{r.warehouse_id}",
                "quantity": float(r.quantity or 0),
                "quantity_original": float(r.quantity_original or 0),
                "status": str(r.status or ""),
                "status_label": _STATUS_PL.get(str(r.status or ""), str(r.status or "")),
            }
        )
    return out
