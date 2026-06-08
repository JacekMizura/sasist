"""Universal inventory search — EAN, SKU, location, product name."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from ...models.product import Product


def _like_term(raw: str) -> str:
    return f"%{str(raw or '').strip()}%"


def search_inventory_execution(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    query: str,
    document_id: int | None = None,
    limit: int = 25,
) -> dict[str, Any]:
    """Fallback search for operators — locations, products, tasks."""
    limit = max(1, min(int(limit), 50))
    term = _like_term(query)
    if term == "%%":
        return {"locations": [], "products": [], "tasks": []}

    loc_q = db.query(Location).filter(
        Location.warehouse_id == int(warehouse_id),
        Location.is_active.is_(True),
        Location.name.ilike(term),
    )
    locations = [
        {"location_id": int(loc.id), "location_code": str(loc.name or ""), "zone": getattr(loc, "operational_zone_type", None)}
        for loc in loc_q.order_by(Location.name.asc()).limit(limit).all()
    ]

    prod_q = db.query(Product).filter(
        Product.tenant_id == int(tenant_id),
        Product.deleted_at.is_(None),
        or_(
            Product.ean.ilike(term),
            Product.sku.ilike(term),
            Product.symbol.ilike(term),
            Product.name.ilike(term),
            Product.catalog_number.ilike(term),
            Product.barcode.ilike(term),
        ),
    )
    products = [
        {
            "product_id": int(p.id),
            "sku": p.sku,
            "ean": p.ean,
            "name": p.name,
            "catalog_number": getattr(p, "catalog_number", None),
        }
        for p in prod_q.order_by(Product.id.asc()).limit(limit).all()
    ]

    task_q = (
        db.query(InventoryTask, Location)
        .outerjoin(Location, Location.id == InventoryTask.location_id)
        .filter(
            InventoryTask.tenant_id == int(tenant_id),
            InventoryTask.warehouse_id == int(warehouse_id),
        )
    )
    if document_id is not None:
        task_q = task_q.filter(InventoryTask.inventory_document_id == int(document_id))
    task_q = task_q.filter(
        or_(
            InventoryTask.task_number.ilike(term),
            Location.name.ilike(term),
        )
    )
    tasks = [
        {
            "task_id": int(task.id),
            "task_number": task.task_number,
            "location_id": int(task.location_id),
            "location_code": (loc.name if loc else None),
            "status": task.status,
            "progress_percent": int(task.progress_percent or 0),
        }
        for task, loc in task_q.order_by(InventoryTask.sequence_no.asc()).limit(limit).all()
    ]

    return {"query": query.strip(), "locations": locations, "products": products, "tasks": tasks}


def resolve_product_for_task_location(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
    query: str,
) -> dict[str, Any]:
    """Find product line at task location by EAN/SKU/name fragment."""
    from .task_service import get_task

    task = get_task(db, tenant_id=tenant_id, task_id=task_id)
    term = _like_term(query)
    rows = (
        db.query(InventoryDocumentLine, Product)
        .join(Product, Product.id == InventoryDocumentLine.product_id)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(task["inventory_document_id"]),
            InventoryDocumentLine.location_id == int(task["location_id"]),
            Product.tenant_id == int(tenant_id),
            or_(
                Product.ean.ilike(term),
                Product.sku.ilike(term),
                Product.symbol.ilike(term),
                Product.name.ilike(term),
                Product.catalog_number.ilike(term),
            ),
        )
        .order_by(InventoryDocumentLine.id.asc())
        .limit(20)
        .all()
    )
    return {
        "matches": [
            {
                "line_id": int(line.id),
                "product_id": int(line.product_id),
                "product_name": product.name,
                "sku": product.sku,
                "ean": product.ean,
                "counted_quantity": line.counted_quantity,
                "status": line.status,
            }
            for line, product in rows
        ]
    }
