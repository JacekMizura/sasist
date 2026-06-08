"""Universal WMS inventory search — products, locations, carriers."""

from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session

from ...models.inventory import Inventory
from ...models.inventory_count.document_line import InventoryDocumentLine
from ...models.inventory_count.task import InventoryTask
from ...models.location import Location
from ...models.product import Product
from ...models.warehouse_carrier import WarehouseCarrier

logger = logging.getLogger(__name__)


def _query_term(raw: str) -> str:
    return str(raw or "").strip()


def _like_term(raw: str) -> str | None:
    term = _query_term(raw)
    if len(term) < 1:
        return None
    return f"%{term}%"


def _product_match_clauses(term_like: str, tenant_id: int, *, exact: str | None = None):
    clauses = []
    if exact:
        for col in (Product.ean, Product.sku, Product.symbol, Product.barcode):
            clauses.append(func.lower(col) == exact.lower())
        if hasattr(Product, "catalog_number"):
            clauses.append(func.lower(Product.catalog_number) == exact.lower())
    for col in (Product.ean, Product.sku, Product.symbol, Product.name, Product.barcode):
        clauses.append(col.ilike(term_like))
    if hasattr(Product, "catalog_number"):
        clauses.append(Product.catalog_number.ilike(term_like))
    return and_(Product.tenant_id == int(tenant_id), or_(*clauses))


def resolve_product_for_task_location(
    db: Session,
    *,
    tenant_id: int,
    task_id: int,
    query: str,
) -> dict[str, Any]:
    """Fuzzy product lookup within active task location."""
    from .task_service import get_task

    task = get_task(db, tenant_id=tenant_id, task_id=task_id)
    term = _like_term(query)
    if not term:
        return {"matches": []}

    rows = (
        db.query(InventoryDocumentLine, Product)
        .join(Product, Product.id == InventoryDocumentLine.product_id)
        .filter(
            InventoryDocumentLine.inventory_document_id == int(task["inventory_document_id"]),
            InventoryDocumentLine.location_id == int(task["location_id"]),
            _product_match_clauses(term, tenant_id),
        )
        .limit(15)
        .all()
    )
    matches = []
    for line, product in rows:
        matches.append(
            {
                "line_id": int(line.id),
                "product_id": int(product.id),
                "product_name": product.name,
                "sku": product.sku,
                "ean": product.ean,
                "image_url": getattr(product, "image_url", None),
                "counted_quantity": line.counted_quantity,
                "status": line.status,
            }
        )
    return {"matches": matches}


def _location_clauses(term_like: str, exact: str):
    clauses = [
        Location.name.ilike(term_like),
        Location.location_uuid.ilike(term_like),
        Location.bin.ilike(term_like),
        Location.rack_name.ilike(term_like),
    ]
    if exact:
        clauses.extend(
            [
                func.lower(Location.name) == exact.lower(),
                func.lower(Location.location_uuid) == exact.lower(),
                func.lower(Location.bin) == exact.lower(),
            ]
        )
    return or_(*clauses)


def _search_products(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    term_like = _like_term(query)
    if not term_like:
        return []
    exact = _query_term(query)
    products: list[dict[str, Any]] = []
    try:
        product_rows = (
            db.query(Product)
            .filter(_product_match_clauses(term_like, tenant_id, exact=exact if len(exact) >= 3 else None))
            .order_by(Product.name.asc())
            .limit(limit)
            .all()
        )
        for p in product_rows:
            stock_rows = (
                db.query(
                    Location.name,
                    func.coalesce(func.sum(Inventory.quantity), 0.0),
                )
                .join(Location, Location.id == Inventory.location_id)
                .filter(
                    Inventory.tenant_id == int(tenant_id),
                    Inventory.warehouse_id == int(warehouse_id),
                    Inventory.product_id == int(p.id),
                )
                .group_by(Location.name)
                .order_by(func.sum(Inventory.quantity).desc())
                .limit(3)
                .all()
            )
            loc_labels = [f"{name} ({float(qty or 0):.0f})" for name, qty in stock_rows if name]
            products.append(
                {
                    "product_id": int(p.id),
                    "sku": p.sku,
                    "ean": p.ean,
                    "name": p.name,
                    "catalog_number": getattr(p, "catalog_number", None),
                    "image_url": getattr(p, "image_url", None),
                    "locations": loc_labels,
                    "stock_hint": loc_labels[0] if loc_labels else None,
                }
            )
    except Exception:
        logger.exception("[inventory_count.search] product search failed")
    return products


def _search_locations_and_tasks(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    document_id: int | None,
    query: str,
    limit: int,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    term_like = _like_term(query)
    if not term_like:
        return [], []
    exact = _query_term(query)
    locations: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []
    seen_task_ids: set[int] = set()

    try:
        loc_rows = (
            db.query(Location)
            .filter(
                Location.warehouse_id == int(warehouse_id),
                Location.is_active.is_(True),
                _location_clauses(term_like, exact),
            )
            .order_by(Location.name.asc())
            .limit(limit)
            .all()
        )
        for loc in loc_rows:
            locations.append(
                {
                    "location_id": int(loc.id),
                    "location_code": str(loc.name or ""),
                    "zone": getattr(loc, "rack_name", None),
                    "aisle": getattr(loc, "rack_name", None),
                }
            )
            tq = db.query(InventoryTask).filter(
                InventoryTask.tenant_id == int(tenant_id),
                InventoryTask.warehouse_id == int(warehouse_id),
                InventoryTask.location_id == int(loc.id),
            )
            if document_id is not None:
                tq = tq.filter(InventoryTask.inventory_document_id == int(document_id))
            task = tq.order_by(InventoryTask.id.desc()).first()
            if task and int(task.id) not in seen_task_ids:
                seen_task_ids.add(int(task.id))
                tasks.append(
                    {
                        "task_id": int(task.id),
                        "task_number": task.task_number,
                        "location_id": int(loc.id),
                        "location_code": str(loc.name or ""),
                        "status": task.status,
                        "progress_percent": int(task.progress_percent or 0),
                    }
                )
    except Exception:
        logger.exception("[inventory_count.search] location search failed")

    return locations, tasks


def _search_carriers(
    db: Session,
    *,
    tenant_id: int,
    query: str,
    limit: int,
) -> list[dict[str, Any]]:
    term_like = _like_term(query)
    if not term_like:
        return []
    exact = _query_term(query)
    carrier_clauses = [
        WarehouseCarrier.code.ilike(term_like),
        WarehouseCarrier.barcode.ilike(term_like),
        WarehouseCarrier.name.ilike(term_like),
    ]
    if exact:
        carrier_clauses.extend(
            [
                func.lower(WarehouseCarrier.code) == exact.lower(),
                func.lower(WarehouseCarrier.barcode) == exact.lower(),
            ]
        )
    carriers: list[dict[str, Any]] = []
    try:
        carrier_rows = (
            db.query(WarehouseCarrier)
            .filter(
                WarehouseCarrier.tenant_id == int(tenant_id),
                or_(*carrier_clauses),
            )
            .limit(limit)
            .all()
        )
        for c in carrier_rows:
            carriers.append(
                {
                    "location_id": int(c.current_location_id) if c.current_location_id else 0,
                    "location_code": str(getattr(c, "code", None) or c.barcode or ""),
                    "zone": "nośnik",
                    "carrier_id": int(c.id),
                }
            )
    except Exception:
        logger.exception("[inventory_count.search] carrier search failed")
    return carriers


def search_inventory_execution(
    db: Session,
    *,
    tenant_id: int,
    warehouse_id: int,
    query: str,
    document_id: int | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Operator search — products, locations, carriers."""
    limit = max(1, min(int(limit), 30))
    q = _query_term(query)
    if len(q) < 1:
        return {"query": "", "locations": [], "products": [], "tasks": []}

    products = _search_products(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        query=q,
        limit=limit,
    )
    locations, tasks = _search_locations_and_tasks(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        document_id=document_id,
        query=q,
        limit=limit,
    )
    carrier_locs = _search_carriers(db, tenant_id=tenant_id, query=q, limit=min(5, limit))
    locations = (locations + carrier_locs)[:limit]

    return {
        "query": q,
        "locations": locations[:limit],
        "products": products[:limit],
        "tasks": tasks[:limit],
    }
