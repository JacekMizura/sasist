"""Unknown product drafts found during WMS inventory counting."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.unknown_product import InventoryUnknownProduct
from ...models.location import Location
from .audit_service import log_inventory_audit
from .errors import InventoryDocumentNotFoundError
from ...models.inventory_count.constants import AUDIT_SCAN
from ...models.inventory_count.document import InventoryDocument


def create_unknown_product_draft(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_id: int,
    task_id: int | None,
    location_id: int,
    temporary_name: str,
    quantity: float = 1.0,
    barcode_value: str | None = None,
    notes: str | None = None,
    photo_url: str | None = None,
    user_id: int | None = None,
    session_id: int | None = None,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Inventory document {document_id} not found")

    loc = db.query(Location).filter(Location.id == int(location_id), Location.warehouse_id == int(warehouse_id)).first()
    if loc is None:
        raise InventoryDocumentNotFoundError(f"Location {location_id} not in warehouse")

    row = InventoryUnknownProduct(
        inventory_document_id=int(document_id),
        inventory_task_id=int(task_id) if task_id else None,
        tenant_id=int(tenant_id),
        warehouse_id=int(warehouse_id),
        location_id=int(location_id),
        temporary_name=str(temporary_name or "Nieznany produkt").strip()[:256],
        barcode_value=(barcode_value or "").strip()[:128] or None,
        quantity=max(0.0, float(quantity or 1)),
        notes=notes,
        photo_url=photo_url,
        status="draft",
        reported_by_user_id=user_id,
        inventory_session_id=session_id,
    )
    db.add(row)
    db.flush()
    log_inventory_audit(
        db,
        tenant_id=int(tenant_id),
        inventory_document_id=int(document_id),
        user_id=user_id,
        session_id=session_id,
        action=AUDIT_SCAN,
        detail={"unknown_product_id": row.id, "temporary_name": row.temporary_name, "quantity": row.quantity},
    )
    db.commit()
    db.refresh(row)
    return _unknown_to_dict(row)


def list_unknown_products(
    db: Session,
    *,
    tenant_id: int,
    document_id: int | None = None,
    warehouse_id: int | None = None,
    status: str = "draft",
    limit: int = 100,
) -> list[dict[str, Any]]:
    q = db.query(InventoryUnknownProduct).filter(InventoryUnknownProduct.tenant_id == int(tenant_id))
    if document_id is not None:
        q = q.filter(InventoryUnknownProduct.inventory_document_id == int(document_id))
    if warehouse_id is not None:
        q = q.filter(InventoryUnknownProduct.warehouse_id == int(warehouse_id))
    if status:
        q = q.filter(InventoryUnknownProduct.status == str(status))
    rows = q.order_by(InventoryUnknownProduct.id.desc()).limit(max(1, min(limit, 500))).all()
    return [_unknown_to_dict(r) for r in rows]


def map_unknown_to_product(
    db: Session,
    *,
    tenant_id: int,
    unknown_id: int,
    product_id: int,
    user_id: int | None = None,
) -> dict[str, Any]:
    row = (
        db.query(InventoryUnknownProduct)
        .filter(InventoryUnknownProduct.id == int(unknown_id), InventoryUnknownProduct.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise InventoryDocumentNotFoundError(f"Unknown product {unknown_id} not found")
    row.mapped_product_id = int(product_id)
    row.mapped_by_user_id = user_id
    row.mapped_at = datetime.utcnow()
    row.status = "mapped"
    row.touch_updated()
    db.commit()
    db.refresh(row)
    return _unknown_to_dict(row)


def _unknown_to_dict(row: InventoryUnknownProduct) -> dict[str, Any]:
    return {
        "id": int(row.id),
        "inventory_document_id": int(row.inventory_document_id),
        "inventory_task_id": row.inventory_task_id,
        "warehouse_id": int(row.warehouse_id),
        "location_id": int(row.location_id),
        "temporary_name": row.temporary_name,
        "barcode_value": row.barcode_value,
        "quantity": float(row.quantity or 0),
        "notes": row.notes,
        "photo_url": row.photo_url,
        "status": row.status,
        "mapped_product_id": row.mapped_product_id,
        "reported_by_user_id": row.reported_by_user_id,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


def reject_unknown_product(
    db: Session,
    *,
    tenant_id: int,
    unknown_id: int,
    user_id: int | None = None,
    reason: str | None = None,
) -> dict[str, Any]:
    row = (
        db.query(InventoryUnknownProduct)
        .filter(InventoryUnknownProduct.id == int(unknown_id), InventoryUnknownProduct.tenant_id == int(tenant_id))
        .first()
    )
    if row is None:
        raise InventoryDocumentNotFoundError(f"Unknown product {unknown_id} not found")
    row.status = "rejected"
    if reason:
        row.notes = ((row.notes or "").strip() + f"\nOdrzucono: {reason}").strip()
    row.touch_updated()
    db.commit()
    db.refresh(row)
    return _unknown_to_dict(row)
