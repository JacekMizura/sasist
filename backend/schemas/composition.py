"""Shared product composition schemas (bundle + manufacturing modes)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

CompositionMode = Literal["bundle", "manufacturing"]


class CompositionLineRead(BaseModel):
    id: int
    component_product_id: int
    quantity: float
    waste_percent: float = 0.0
    sort_order: int = 0
    notes: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    product_stock: Optional[float] = None


class CompositionLineWrite(BaseModel):
    component_product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    waste_percent: float = Field(0.0, ge=0, le=100)
    sort_order: int = 0
    notes: Optional[str] = None


class ProductCompositionRead(BaseModel):
    id: int
    tenant_id: int
    product_id: int
    composition_mode: CompositionMode
    name: str
    version: str
    is_active: bool
    yield_quantity: float
    notes: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    lines: List[CompositionLineRead] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProductCompositionCreateBody(BaseModel):
    product_id: int = Field(..., ge=1)
    composition_mode: CompositionMode
    name: str = Field(..., min_length=1, max_length=256)
    version: str = Field("1", max_length=32)
    yield_quantity: float = Field(1.0, gt=0)
    notes: Optional[str] = None
    is_active: bool = False
    lines: List[CompositionLineWrite] = Field(default_factory=list)


class ProductCompositionUpdateBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    version: Optional[str] = Field(None, max_length=32)
    yield_quantity: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    lines: Optional[List[CompositionLineWrite]] = None


class CompositionUsageRead(BaseModel):
    composition_id: int
    composition_name: str
    composition_mode: CompositionMode
    parent_product_id: int
    parent_product_name: str
    quantity: float


class CompositionCostEstimateRead(BaseModel):
    composition_id: int
    yield_quantity: float
    lines: List[dict]
    total_cost_net: float
    unit_cost_net: float


class AggregatedComponentDemandRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    required: float
    available: float
    missing: float
