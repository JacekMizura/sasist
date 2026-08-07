"""Packaging materials domain — stockable bridge into the shared Inventory engine.

Carton / PackagingMaterial remain master data (dims, BDO kg). Physical stock lives
only in ``inventory`` via a linked ``products`` row (``stock_item_kind``).
"""

from .constants import (
    STOCK_ITEM_KIND_CARTON,
    STOCK_ITEM_KIND_PACKAGING,
    STOCK_ITEM_KIND_SELLABLE,
    STOCK_ITEM_KINDS_PACKAGING,
)
from .stockable_bridge import (
    ensure_carton_stockable_product,
    ensure_packaging_stockable_product,
    resolve_product_id_for_wm,
    wm_ref_for_product,
)
from .inventory_qty import packaging_inventory_quantity, packaging_inventory_by_location

__all__ = [
    "STOCK_ITEM_KIND_CARTON",
    "STOCK_ITEM_KIND_PACKAGING",
    "STOCK_ITEM_KIND_SELLABLE",
    "STOCK_ITEM_KINDS_PACKAGING",
    "ensure_carton_stockable_product",
    "ensure_packaging_stockable_product",
    "resolve_product_id_for_wm",
    "wm_ref_for_product",
    "packaging_inventory_quantity",
    "packaging_inventory_by_location",
]
