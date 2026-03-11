"""
Dev utility endpoints (testing, seed data).
"""

from fastapi import APIRouter, Depends, Query

from ..database import get_db
from ..services.generate_test_stock_service import generate_test_stock
from ..services.sync_inventory_to_stock_service import sync_inventory_to_stock
from ..services.distribute_import_stock_service import distribute_import_stock
from sqlalchemy.orm import Session

router = APIRouter(prefix="/dev", tags=["Dev"])


@router.post("/generate-test-stock")
def post_generate_test_stock(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int = Query(..., description="Warehouse ID"),
    product_limit: int = Query(200, ge=1, le=2000, description="Max products to assign"),
    replace_existing: bool = Query(False, description="If true, delete existing stock for this tenant+warehouse first"),
    db: Session = Depends(get_db),
):
    """
    Generate test warehouse stock: randomly assign tenant products to storage locations.
    Excludes special locations (PICK_START, PACKING, DOCK, IMPORT, BUFFER).
    Random quantity 1–100 per row. Respects location capacity if defined.
    Returns products_assigned, locations_used, total_stock_rows_created.
    """
    return generate_test_stock(
        db,
        tenant_id=tenant_id,
        warehouse_id=warehouse_id,
        product_limit=product_limit,
        replace_existing=replace_existing,
    )


@router.post("/sync-inventory-to-stock")
def post_sync_inventory_to_stock(
    default_quantity: float = Query(10.0, ge=0, description="Quantity to set for new stock rows"),
    db: Session = Depends(get_db),
):
    """
    Sync inventory to stock: for each (tenant, product, warehouse, location) in inventory,
    create a stock row with default_quantity if none exists; do not overwrite existing stock.
    For development/testing. Returns products_processed, stock_rows_created, stock_rows_existing.
    """
    return sync_inventory_to_stock(db, default_quantity=default_quantity)


@router.post("/distribute-import-stock")
def post_distribute_import_stock(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int = Query(..., description="Warehouse ID"),
    db: Session = Depends(get_db),
):
    """
    Distribute stock from Import location into real storage locations.
    Finds location named 'Import', moves each stock row there to a random storage location
    (excludes Import, Buffer, Packing, etc.). Large quantities (e.g. >50) are split
    across 2-3 locations. Returns rows_processed, locations_used.
    """
    return distribute_import_stock(db, tenant_id=tenant_id, warehouse_id=warehouse_id)


@router.post("/putaway-import-stock")
def post_putaway_import_stock(
    tenant_id: int = Query(..., description="Tenant ID"),
    warehouse_id: int = Query(..., description="Warehouse ID"),
    db: Session = Depends(get_db),
):
    """
    Putaway: move stock from Import location to real warehouse storage locations.
    Same behavior as distribute-import-stock. Returns rows_processed, locations_used.
    """
    return distribute_import_stock(db, tenant_id=tenant_id, warehouse_id=warehouse_id)
