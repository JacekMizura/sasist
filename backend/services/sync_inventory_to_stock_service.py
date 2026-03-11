"""
Dev utility: sync inventory table to stock table.

Reads product-location assignments from inventory; for each (tenant, product, warehouse, location)
creates a stock row with default_quantity if none exists. Does not overwrite existing stock quantity.
"""

from sqlalchemy.orm import Session

from ..models.inventory import Inventory
from ..models.stock import Stock


def sync_inventory_to_stock(
    db: Session,
    default_quantity: float = 10.0,
) -> dict:
    """
    For each inventory record, ensure a corresponding stock row exists.
    If stock row does not exist: create it with default_quantity.
    If stock row exists: do not overwrite quantity.
    Returns { products_processed, stock_rows_created, stock_rows_existing }.
    """
    rows = db.query(Inventory).all()
    products_processed = len(rows)
    stock_rows_created = 0
    stock_rows_existing = 0

    for inv in rows:
        existing = (
            db.query(Stock)
            .filter(
                Stock.tenant_id == inv.tenant_id,
                Stock.product_id == inv.product_id,
                Stock.warehouse_id == inv.warehouse_id,
                Stock.location_id == inv.location_id,
            )
            .first()
        )
        if existing:
            stock_rows_existing += 1
            continue
        db.add(
            Stock(
                tenant_id=inv.tenant_id,
                product_id=inv.product_id,
                warehouse_id=inv.warehouse_id,
                location_id=inv.location_id,
                quantity=default_quantity,
            )
        )
        stock_rows_created += 1

    db.commit()
    return {
        "products_processed": products_processed,
        "stock_rows_created": stock_rows_created,
        "stock_rows_existing": stock_rows_existing,
    }
