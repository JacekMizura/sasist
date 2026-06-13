"""Per-warehouse product slotting API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from fastapi import Depends
from ..auth.warehouse_deps import (
    require_operable_warehouse,
    require_active_operable_warehouse,
    require_active_or_query_operable_warehouse,
    assert_stock_document_warehouse,
    enforce_warehouse_access,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.product import Product
from ..schemas.product_warehouse_slotting import (
    ProductWarehouseSlottingPutBody,
    ProductWarehouseSlottingRead,
    SlottingLocationEntry,
    WarehouseSlottingBulkItem,
    WarehouseSlottingBulkRead,
)
from ..services.product_warehouse_slotting_service import (
    get_product_slotting_entries,
    get_warehouse_slotting_map,
    replace_product_slotting_for_warehouse,
)

router = APIRouter(tags=["Product warehouse slotting"])


@router.get("/products/slotting", response_model=WarehouseSlottingBulkRead)
def get_warehouse_product_slotting_bulk(
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """All slotting rows for a warehouse (Designer / import-export)."""
    slot_map = get_warehouse_slotting_map(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
    items = [
        WarehouseSlottingBulkItem(
            product_id=pid,
            assigned_locations=[SlottingLocationEntry(**e) for e in entries],
        )
        for pid, entries in sorted(slot_map.items())
    ]
    return WarehouseSlottingBulkRead(warehouse_id=warehouse_id, tenant_id=tenant_id, items=items)


@router.get("/products/{product_id}/slotting", response_model=ProductWarehouseSlottingRead)
def get_product_warehouse_slotting(
    product_id: int,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    product = (
        db.query(Product)
        .filter(Product.id == product_id, Product.tenant_id == tenant_id, Product.deleted_at.is_(None))
        .first()
    )
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    entries = get_product_slotting_entries(
        db, tenant_id=tenant_id, product_id=product_id, warehouse_id=warehouse_id
    )
    return ProductWarehouseSlottingRead(
        product_id=product_id,
        warehouse_id=warehouse_id,
        tenant_id=tenant_id,
        assigned_locations=[SlottingLocationEntry(**e) for e in entries],
    )


@router.put("/products/{product_id}/slotting", response_model=ProductWarehouseSlottingRead)
def put_product_warehouse_slotting(
    product_id: int,
    body: ProductWarehouseSlottingPutBody,
    tenant_id: int = Query(..., ge=1),
    warehouse_id: int = Depends(require_operable_warehouse),
    db: Session = Depends(get_db),
):
    """Replace slotting plan for one product in one warehouse (does not touch other warehouses)."""
    payload = [e.model_dump() for e in body.assigned_locations]
    entries = replace_product_slotting_for_warehouse(
        db,
        tenant_id=tenant_id,
        product_id=product_id,
        warehouse_id=warehouse_id,
        entries=payload,
    )
    db.commit()
    return ProductWarehouseSlottingRead(
        product_id=product_id,
        warehouse_id=warehouse_id,
        tenant_id=tenant_id,
        assigned_locations=[SlottingLocationEntry(**e) for e in entries],
    )
