"""Stock item kinds — sellable products vs packaging catalog stockables."""

from __future__ import annotations

STOCK_ITEM_KIND_SELLABLE = "SELLABLE"
STOCK_ITEM_KIND_CARTON = "CARTON"
STOCK_ITEM_KIND_PACKAGING = "PACKAGING_MATERIAL"

STOCK_ITEM_KINDS_PACKAGING = frozenset({STOCK_ITEM_KIND_CARTON, STOCK_ITEM_KIND_PACKAGING})

WM_KIND_CARTON = "carton"
WM_KIND_PACKAGING = "packaging"
