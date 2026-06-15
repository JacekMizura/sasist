"""WMS operational product preview (no pricing / orders)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from .inventory_damage_trace import InventoryDamageTraceOut
from .product_disposition_stock import ProductDispositionStockOut


class WmsProductDispositionStock(ProductDispositionStockOut):
    """WMS product view — same disposition breakdown as product API."""


class WmsProductViewLocation(BaseModel):
    location_id: int = Field(..., ge=1)
    code: str
    quantity: float = Field(..., ge=0)
    badge: str = Field(..., description="PICK, OVERSTOCK, FLOOR, STORAGE, …")
    location_type: Optional[str] = Field(None, description="NORMAL, PICK_START, …")
    stock_disposition: Optional[str] = None
    disposition_badge: Optional[str] = None
    damage_class: Optional[str] = None
    damage_trace: Optional[InventoryDamageTraceOut] = None


class WmsProductViewLogistics(BaseModel):
    weight_kg: Optional[float] = None
    volume_dm3: Optional[float] = None
    length_cm: Optional[float] = None
    width_cm: Optional[float] = None
    height_cm: Optional[float] = None
    unit: Optional[str] = None


class WmsProductViewPackage(BaseModel):
    carton_ean: Optional[str] = None
    units_per_carton: Optional[float] = None
    carton_weight_kg: Optional[float] = None
    carton_volume_dm3: Optional[float] = None
    carton_length_cm: Optional[float] = None
    carton_width_cm: Optional[float] = None
    carton_height_cm: Optional[float] = None


class WmsProductViewResponse(BaseModel):
    product_id: int = Field(..., ge=1)
    name: str
    ean: Optional[str] = None
    sku: Optional[str] = None
    image: Optional[str] = Field(None, description="URL zdjęcia produktu")
    total_stock: float = Field(..., ge=0)
    disposition_stock: WmsProductDispositionStock = Field(
        default_factory=WmsProductDispositionStock,
        description="Physical qty per disposition pool (additive; total_stock unchanged)",
    )
    locations: list[WmsProductViewLocation] = Field(default_factory=list)
    commercially_sellable_qty: float = Field(
        0,
        ge=0,
        description="saleable_available_qty minus effective purchase-line sales blocks",
    )
    sales_blocked_qty: float = Field(
        0,
        ge=0,
        description="Effective sales block total for this product in warehouse",
    )
    dock_qty: float = Field(
        0,
        ge=0,
        description="Physical SALEABLE qty on DOCK-IN awaiting putaway",
    )
    requires_putaway: bool = Field(
        True,
        description="Warehouse profile — when true, dock_qty blocks ATP until putaway",
    )
    logistics: WmsProductViewLogistics
    package: WmsProductViewPackage
