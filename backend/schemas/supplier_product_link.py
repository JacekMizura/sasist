"""Pydantic models for supplier ↔ product catalog rows (supplier_products)."""

from typing import List, Optional

from pydantic import BaseModel, Field

from .supplier_products import SupplierCatalogPriceTier


class SupplierProductLinkRead(BaseModel):
    id: int
    supplier_id: int
    product_id: int
    supplier_name: str
    product_name: str
    product_symbol: Optional[str] = None
    purchase_price: Optional[float] = None
    purchase_price_tiers: List[SupplierCatalogPriceTier] = Field(default_factory=list)
    lead_time_days: Optional[int] = None
    min_order_qty: Optional[float] = None
    is_default_supplier: bool = False


class SupplierProductLinkCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    supplier_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    purchase_price: Optional[float] = Field(None, ge=0)
    purchase_price_tiers: Optional[List[SupplierCatalogPriceTier]] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    min_order_qty: Optional[float] = Field(None, ge=0)


class SupplierProductLinkPatchBody(BaseModel):
    purchase_price: Optional[float] = Field(None, ge=0)
    purchase_price_tiers: Optional[List[SupplierCatalogPriceTier]] = None
    lead_time_days: Optional[int] = Field(None, ge=0)
    min_order_qty: Optional[float] = Field(None, ge=0)
