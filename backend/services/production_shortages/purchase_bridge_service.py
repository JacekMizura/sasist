"""Bridge production material gaps → Purchasing module."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.product_material_substitute import ProductionMaterialNeed
from ...models.purchase_order import PurchaseOrder, PurchaseOrderItem
from ...models.supplier import Supplier
from ..purchasing_order_service import PO_DRAFT, recalculate_purchase_order_totals
from .material_need_service import record_need_created


class PurchaseBridgeError(ValueError):
    def __init__(self, message: str, *, code: str = "purchase_bridge_error"):
        super().__init__(message)
        self.code = code


def create_material_need(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_product_id: int,
    shortage_qty: float,
    source_ref: dict[str, Any] | None = None,
) -> ProductionMaterialNeed:
    row = ProductionMaterialNeed(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        component_product_id=int(component_product_id),
        shortage_qty=round(float(shortage_qty), 4),
        status="open",
        source_ref_json=json.dumps(source_ref or {}, ensure_ascii=False),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row


def create_draft_purchase_requisition(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    component_product_id: int,
    quantity: float,
    supplier_id: int | None = None,
    notes: str | None = None,
    source_ref: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create Draft PO with one line — integration point for Purchasing module."""
    if float(quantity) <= 1e-9:
        raise PurchaseBridgeError("Ilość musi być > 0.", code="invalid_qty")
    sup_id = int(supplier_id) if supplier_id else None
    if sup_id is None:
        sup = (
            db.query(Supplier)
            .filter(Supplier.tenant_id == int(tenant_id))
            .order_by(Supplier.id.asc())
            .first()
        )
        if sup is None:
            raise PurchaseBridgeError("Brak dostawcy — skonfiguruj moduł Zakupy.", code="no_supplier")
        sup_id = int(sup.id)
    else:
        sup = db.query(Supplier).filter(Supplier.id == sup_id, Supplier.tenant_id == int(tenant_id)).first()
        if sup is None:
            raise PurchaseBridgeError("Dostawca nie istnieje.", code="supplier_not_found")

    po = PurchaseOrder(
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        supplier_id=int(sup_id),
        order_number=f"PROD-NEED-{int(datetime.utcnow().timestamp())}",
        status=PO_DRAFT,
        notes=(notes or "Zapotrzebowanie z braków produkcji")[:2000],
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(po)
    db.flush()
    po.order_number = f"PO/{datetime.utcnow().year}/{int(po.id)}"
    item = PurchaseOrderItem(
        purchase_order_id=int(po.id),
        product_id=int(component_product_id),
        qty=round(float(quantity), 4),
        received_qty=0.0,
        line_total=0.0,
        notes="Brak produkcji",
    )
    db.add(item)
    db.flush()
    recalculate_purchase_order_totals(po)

    need = create_material_need(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        component_product_id=component_product_id,
        shortage_qty=quantity,
        source_ref=source_ref,
    )
    need.purchase_order_id = int(po.id)
    need.purchase_order_item_id = int(item.id)
    need.status = "linked"
    need.updated_at = datetime.utcnow()
    record_need_created(need)
    db.flush()
    return {
        "purchase_order_id": int(po.id),
        "purchase_order_item_id": int(item.id),
        "material_need_id": int(need.id),
        "order_number": po.order_number,
        "status": po.status,
    }


def add_to_purchase_order(
    db: Session,
    *,
    tenant_id: int,
    purchase_order_id: int,
    component_product_id: int,
    quantity: float,
    warehouse_id: int | None = None,
    source_ref: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if float(quantity) <= 1e-9:
        raise PurchaseBridgeError("Ilość musi być > 0.", code="invalid_qty")
    po = (
        db.query(PurchaseOrder)
        .filter(PurchaseOrder.id == int(purchase_order_id), PurchaseOrder.tenant_id == int(tenant_id))
        .first()
    )
    if po is None:
        raise PurchaseBridgeError("Zamówienie zakupu nie istnieje.", code="po_not_found")
    if str(po.status) in ("Closed", "Cancelled"):
        raise PurchaseBridgeError("Zamówienie jest zamknięte.", code="po_closed")

    existing = (
        db.query(PurchaseOrderItem)
        .filter(
            PurchaseOrderItem.purchase_order_id == int(po.id),
            PurchaseOrderItem.product_id == int(component_product_id),
        )
        .first()
    )
    if existing is not None:
        existing.qty = round(float(existing.qty or 0) + float(quantity), 4)
        item = existing
    else:
        item = PurchaseOrderItem(
            purchase_order_id=int(po.id),
            product_id=int(component_product_id),
            qty=round(float(quantity), 4),
            received_qty=0.0,
            line_total=0.0,
            notes="Brak produkcji",
        )
        db.add(item)
    db.flush()
    recalculate_purchase_order_totals(po)

    wh_id = int(po.warehouse_id) if po.warehouse_id else (int(warehouse_id) if warehouse_id else None)
    if wh_id is None:
        raise PurchaseBridgeError("Brak magazynu — wybierz magazyn lub użyj zamówienia z przypisanym magazynem.", code="no_warehouse")

    need = create_material_need(
        db,
        tenant_id=tenant_id,
        warehouse_id=wh_id,
        component_product_id=component_product_id,
        shortage_qty=quantity,
        source_ref=source_ref,
    )
    need.purchase_order_id = int(po.id)
    need.purchase_order_item_id = int(item.id)
    need.status = "linked"
    record_need_created(need)
    db.flush()
    return {
        "purchase_order_id": int(po.id),
        "purchase_order_item_id": int(item.id),
        "material_need_id": int(need.id),
        "order_number": po.order_number,
        "status": po.status,
    }
