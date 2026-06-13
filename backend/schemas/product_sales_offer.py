"""Product sales offers API schemas (Etap 3A)."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ProductSalesOfferRead(BaseModel):
    id: int
    product_id: int
    stock_disposition: str
    name: str
    sale_price_net: Optional[float] = Field(
        None,
        description="Override; NULL = fallback to Product.sale_price",
    )
    effective_sale_price_net: Optional[float] = None
    uses_product_price: bool = True
    is_default: bool = False
    active: bool = True
    available_qty: float = 0.0
    stock_pool_id: Optional[int] = None
    stock_pool_name: Optional[str] = None


class ProductSalesOffersListOut(BaseModel):
    product_id: int
    offers: List[ProductSalesOfferRead]


class ProductSalesOfferPatchBody(BaseModel):
    name: Optional[str] = Field(None, max_length=512)
    sale_price_net: Optional[float] = Field(
        None,
        ge=0,
        description="Set explicit price; send null to clear override and use product price",
    )
    active: Optional[bool] = None
    stock_pool_id: Optional[int] = Field(
        None,
        description="Stock pool for availability; null = tenant default pool",
    )


class ProductSalesOfferSearchHit(BaseModel):
    offer_id: int
    product_id: int
    name: str
    stock_disposition: str
    effective_sale_price_net: Optional[float] = None
    available_qty: float
    product_name: Optional[str] = None
    sku: Optional[str] = None
    ean: Optional[str] = None
    image_url: Optional[str] = None
