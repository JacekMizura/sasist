"""
Dev utility: sync inventory table to stock table.

Reads product-location assignments from inventory; for each (tenant, product, warehouse, location)
creates a stock row with default_quantity if none exists. Does not overwrite existing stock quantity.
"""

import logging
from sqlalchemy.orm import Session

from ..models.inventory import Inventory

logger = logging.getLogger(__name__)


def sync_inventory_to_stock(
    db: Session,
    default_quantity: float = 10.0,
) -> dict:
    """
    Deprecated: stock table is no longer the source of physical truth.
    Kept as no-op for backward compatibility.
    """
    products_processed = db.query(Inventory).count()
    logger.warning(
        "Stock table is deprecated - using inventory instead (sync_inventory_to_stock is a no-op)."
    )
    return {
        "products_processed": products_processed,
        "stock_rows_created": 0,
        "stock_rows_existing": 0,
    }
