"""ERP document line listing and supervisor views."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ...models.inventory_count.document import InventoryDocument
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.location import Location
from ...models.product import Product
from .difference_service import analyze_document_differences
from .errors import InventoryDocumentNotFoundError


def list_document_lines(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
    include_supervisor_fields: bool = True,
    offset: int = 0,
    limit: int = 500,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")

    blind = doc.count_mode == "blind" and not include_supervisor_fields
    base_q = (
        db.query(InventoryDocumentLine, Product, Location)
        .outerjoin(Product, Product.id == InventoryDocumentLine.product_id)
        .outerjoin(Location, Location.id == InventoryDocumentLine.location_id)
        .filter(InventoryDocumentLine.inventory_document_id == int(document_id))
    )
    total = base_q.count()
    rows = (
        base_q.order_by(Location.name.asc(), Product.sku.asc())
        .offset(max(0, int(offset)))
        .limit(min(int(limit), 2000))
        .all()
    )
    out: list[dict[str, Any]] = []
    for line, product, loc in rows:
        item: dict[str, Any] = {
            "id": line.id,
            "location_id": line.location_id,
            "location_name": loc.name if loc else None,
            "product_id": line.product_id,
            "sku": getattr(product, "sku", None) if product else None,
            "ean": getattr(product, "ean", None) if product else None,
            "product_name": getattr(product, "name", None) if product else None,
            "counted_quantity": line.counted_quantity,
            "status": line.status,
            "batch_number": line.batch_number,
            "serial_number": line.serial_number,
            "recount_count": line.recount_count,
            "confidence_score": line.confidence_score,
            "version": line.version,
        }
        if not blind or include_supervisor_fields:
            item["expected_quantity"] = line.expected_quantity
            item["difference_quantity"] = line.difference_quantity
        out.append(item)
    return {"items": out, "total": total, "offset": offset, "limit": limit}


def get_document_difference_analysis(
    db: Session,
    *,
    tenant_id: int,
    document_id: int,
) -> dict[str, Any]:
    doc = (
        db.query(InventoryDocument)
        .filter(InventoryDocument.id == int(document_id), InventoryDocument.tenant_id == int(tenant_id))
        .first()
    )
    if doc is None:
        raise InventoryDocumentNotFoundError(f"Document {document_id} not found")
    return analyze_document_differences(db, document=doc)
