"""Production / manufacturing API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

ProductionOrderStatus = Literal["draft", "planned", "in_progress", "completed", "cancelled"]


class ProductionRecipeLineRead(BaseModel):
    id: int
    component_product_id: int
    quantity: float
    waste_percent: float = 0.0
    sort_order: int = 0
    notes: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    product_stock: Optional[float] = None


class ProductionRecipeLineWrite(BaseModel):
    component_product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    waste_percent: float = Field(0.0, ge=0, le=100)
    sort_order: int = 0
    notes: Optional[str] = None


class ProductionRecipeRead(BaseModel):
    id: int
    tenant_id: int
    product_id: int
    name: str
    version: str
    is_active: bool
    yield_quantity: float
    notes: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    lines: List[ProductionRecipeLineRead] = Field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProductionRecipeCreateBody(BaseModel):
    product_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    version: str = Field("1", max_length=32)
    yield_quantity: float = Field(1.0, gt=0)
    notes: Optional[str] = None
    is_active: bool = False
    lines: List[ProductionRecipeLineWrite] = Field(default_factory=list)

    @field_validator("lines")
    @classmethod
    def no_self_component(cls, v: List[ProductionRecipeLineWrite], info) -> List[ProductionRecipeLineWrite]:
        return v


class ProductionRecipeUpdateBody(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=256)
    version: Optional[str] = Field(None, max_length=32)
    yield_quantity: Optional[float] = Field(None, gt=0)
    notes: Optional[str] = None
    is_active: Optional[bool] = None
    lines: Optional[List[ProductionRecipeLineWrite]] = None


class ComponentRequirementRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    quantity_per_yield: float
    waste_percent: float
    quantity_per_unit: float
    total_required: float
    available: float
    missing: float


class RecipeUsageRead(BaseModel):
    """Product used as component in other recipes."""
    recipe_id: int
    recipe_name: str
    finished_product_id: int
    finished_product_name: str
    quantity: float


class ProductionLocationSuggestionRead(BaseModel):
    location_id: int
    code: str
    available: float
    operational_zone_type: Optional[str] = None
    auto_pick_qty: float = 0.0
    is_suggested: bool = False


class ProductionAllocationRead(BaseModel):
    location_id: int
    location_code: str
    quantity: float


class StockShortageRead(BaseModel):
    component_product_id: int
    product_name: str
    required: float
    available: float
    missing: float


class ProductionPickLinePlanRead(BaseModel):
    line_snapshot_id: int
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    required: float
    available: float
    missing: float
    suggested_locations: List[ProductionLocationSuggestionRead] = Field(default_factory=list)
    auto_allocation: List[ProductionAllocationRead] = Field(default_factory=list)


class ProductionPickPlanRead(BaseModel):
    order_id: int
    warehouse_id: int
    shortages: List[StockShortageRead] = Field(default_factory=list)
    has_shortages: bool = False
    lines: List[ProductionPickLinePlanRead] = Field(default_factory=list)


class RecipeLineCostRead(BaseModel):
    component_product_id: int
    product_name: str
    quantity: float
    waste_percent: float
    unit_cost_net: float
    line_cost_net: float


class RecipeCostEstimateRead(BaseModel):
    recipe_id: int
    yield_quantity: float
    lines: List[RecipeLineCostRead] = Field(default_factory=list)
    total_cost_net: float
    unit_cost_net: float


class ProductionOrderSummaryRead(BaseModel):
    """Lightweight row for product manufacturing history."""
    id: int
    number: str
    status: ProductionOrderStatus
    planned_quantity: float
    produced_quantity: float
    calculated_unit_cost: Optional[float] = None
    component_total_cost: Optional[float] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    operator_name: Optional[str] = None


class WarehouseLocationSearchRow(BaseModel):
    id: int
    code: str
    operational_zone_type: Optional[str] = None


class ProductionOrderLineSnapshotRead(BaseModel):
    id: int
    component_product_id: int
    quantity_per_unit: float
    total_required_quantity: float
    consumed_quantity: float
    product_name_snapshot: str
    product_sku_snapshot: Optional[str] = None
    available: Optional[float] = None
    missing: Optional[float] = None
    reserved: Optional[float] = None


class ProductionOrderRead(BaseModel):
    id: int
    tenant_id: int
    number: str
    recipe_id: int
    product_id: int
    warehouse_id: int
    location_id: Optional[int] = None
    planned_quantity: float
    produced_quantity: float
    status: ProductionOrderStatus
    priority: int = 0
    notes: Optional[str] = None
    calculated_unit_cost: Optional[float] = None
    rw_stock_document_id: Optional[int] = None
    pw_stock_document_id: Optional[int] = None
    rw_document_number: Optional[str] = None
    pw_document_number: Optional[str] = None
    component_total_cost: Optional[float] = None
    operator_name: Optional[str] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    warehouse_name: Optional[str] = None
    location_name: Optional[str] = None
    recipe_name: Optional[str] = None
    lines: List[ProductionOrderLineSnapshotRead] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ProductionOrderCreateBody(BaseModel):
    recipe_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    location_id: Optional[int] = Field(None, ge=1)
    planned_quantity: float = Field(..., gt=0)
    priority: int = 0
    notes: Optional[str] = None
    status: ProductionOrderStatus = "planned"


class ComponentAllocationWrite(BaseModel):
    line_snapshot_id: int = Field(..., ge=1)
    location_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)


class ProductionOrderCompleteBody(BaseModel):
    produced_quantity: Optional[float] = Field(None, gt=0)
    location_id: Optional[int] = Field(None, ge=1, description="Target bin for finished goods")
    component_allocations: Optional[List[ComponentAllocationWrite]] = None


class ProductionCompleteResultRead(BaseModel):
    order: ProductionOrderRead
    rw_stock_document_id: Optional[int] = None
    pw_stock_document_id: Optional[int] = None
    rw_document_number: Optional[str] = None
    pw_document_number: Optional[str] = None
    calculated_unit_cost: Optional[float] = None
    component_total_cost: Optional[float] = None
    shortages: List[StockShortageRead] = Field(default_factory=list)
