"""WMS operational product preview (no pricing / orders)."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class WmsProductViewLocation(BaseModel):
    location_id: int = Field(..., ge=1)
    code: str
    quantity: float = Field(..., ge=0)
    badge: str = Field(..., description="PICK, OVERSTOCK, FLOOR, STORAGE, …")
    location_type: Optional[str] = Field(None, description="NORMAL, PICK_START, …")


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
    locations: list[WmsProductViewLocation] = Field(default_factory=list)
    logistics: WmsProductViewLogistics
    package: WmsProductViewPackage
