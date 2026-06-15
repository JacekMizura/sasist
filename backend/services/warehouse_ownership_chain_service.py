"""P2.3 — warehouse_id propagation chain: PO → Delivery → PZ."""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models.inbound_delivery import InboundDelivery
from ..models.purchase_order import PurchaseOrder
from ..models.stock_document import StockDocument

ERR_DELIVERY_PO_WAREHOUSE_MISMATCH = (
    "Magazyn dostawy musi odpowiadać magazynowi zamówienia zakupu."
)
ERR_PZ_DELIVERY_WAREHOUSE_MISMATCH = (
    "Magazyn PZ musi odpowiadać magazynowi dostawy."
)
ERR_PZ_PO_WAREHOUSE_MISMATCH = (
    "Magazyn PZ musi odpowiadać magazynowi zamówienia zakupu powiązanego z dostawą."
)


def assert_delivery_matches_purchase_order_warehouse(
    db: Session,
    delivery: InboundDelivery,
    *,
    tenant_id: int,
) -> None:
    """Delivery warehouse must equal linked PO warehouse when PO exists."""
    po_id = getattr(delivery, "purchase_order_id", None)
    if po_id is None:
        return
    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == int(po_id), PurchaseOrder.tenant_id == int(tenant_id))
        .first()
    )
    if po is None:
        return
    po_wh = getattr(po, "warehouse_id", None)
    del_wh = getattr(delivery, "warehouse_id", None)
    if po_wh is None or del_wh is None:
        return
    if int(po_wh) != int(del_wh):
        raise ValueError(ERR_DELIVERY_PO_WAREHOUSE_MISMATCH)


def assert_pz_inherits_delivery_warehouse(
    *,
    delivery_warehouse_id: int,
    pz_warehouse_id: int,
) -> None:
    """PZ must inherit delivery warehouse — no override, no guess."""
    if int(pz_warehouse_id) != int(delivery_warehouse_id):
        raise ValueError(ERR_PZ_DELIVERY_WAREHOUSE_MISMATCH)


def assert_no_conflicting_pz_on_delivery(
    db: Session,
    *,
    tenant_id: int,
    delivery_id: int,
    delivery_warehouse_id: int,
) -> None:
    """Block create when an existing PZ on this delivery belongs to another warehouse."""
    existing = (
        db.query(StockDocument)
        .filter(
            StockDocument.tenant_id == int(tenant_id),
            StockDocument.delivery_id == int(delivery_id),
            StockDocument.document_type == "PZ",
        )
        .all()
    )
    for doc in existing:
        doc_wh = getattr(doc, "warehouse_id", None)
        if doc_wh is not None and int(doc_wh) != int(delivery_warehouse_id):
            raise ValueError(ERR_PZ_DELIVERY_WAREHOUSE_MISMATCH)
