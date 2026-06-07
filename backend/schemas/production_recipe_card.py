"""Production recipe card schemas (warehouse-first recipe browser)."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class RecipeCardRead(BaseModel):
    composition_id: int
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    recipe_name: str
    version: str
    is_active: bool
    component_count: int = 0
    unit_cost_net: Optional[float] = None
    current_stock: float = 0.0
    max_producible: float = 0.0
    has_low_stock: bool = False
    status_badge: str = "DRAFT"  # ACTIVE | DRAFT | LOW_STOCK


class RecipeComponentDetailRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    required_per_unit: float
    available: float = 0.0
    shortage: float = 0.0
    unit_cost_net: Optional[float] = None
    line_cost_net: Optional[float] = None
    suggested_locations: List[str] = Field(default_factory=list)


class RecipeDetailRead(BaseModel):
    composition_id: int
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    recipe_name: str
    version: str
    is_active: bool
    yield_quantity: float = 1.0
    current_stock: float = 0.0
    unit_cost_net: Optional[float] = None
    margin_hint: Optional[float] = None
    max_producible: float = 0.0
    components: List[RecipeComponentDetailRead] = Field(default_factory=list)
    total_cost_net: Optional[float] = None
    has_shortages: bool = False
    shortage_summary: List[str] = Field(default_factory=list)


class ProductionDashboardRead(BaseModel):
    active_batches: int = 0
    collecting_batches: int = 0
    in_production_batches: int = 0
    putaway_batches: int = 0
    recipe_count: int = 0
    batches_with_shortages: int = 0
