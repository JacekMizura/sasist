"""WMS product search (MM / manual add)."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WmsProductSearchLocationRow(BaseModel):
    location_id: int
    location_code: str
    quantity: float
    carrier_code: str | None = None


class WmsProductSearchHit(BaseModel):
    product_id: int
    product_name: str
    product_sku: str | None = None
    product_ean: str | None = None
    product_image_url: str | None = None
    total_quantity: float = 0.0
    locations: list[WmsProductSearchLocationRow] = Field(default_factory=list)
    created_in_wms: bool = False


class WmsCreateMinimalProductBody(BaseModel):
    """Minimal product for WMS (receiving PZ optional)."""

    name: str = Field(..., min_length=1, max_length=512)
    ean: str | None = Field(default=None, max_length=64)
    sku: str | None = Field(default=None, max_length=128)
    unit: str = Field(default="szt.", max_length=32)
    create_in_assortment: bool = True
    pz_id: int | None = Field(default=None, ge=1)
