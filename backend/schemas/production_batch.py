"""Production batch / wave schemas."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .composition import AggregatedComponentDemandRead, CompositionLineRead
from .production import ComponentAllocationWrite, ProductionAllocationRead, ProductionLocationSuggestionRead, StockShortageRead

ProductionBatchStatus = Literal["draft", "planned", "in_progress", "completed", "cancelled"]


class ProductionBatchLineWrite(BaseModel):
    product_id: int = Field(..., ge=1)
    composition_id: int = Field(..., ge=1)
    planned_quantity: float = Field(..., gt=0)
    target_location_id: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None


class ProductionBatchLineRead(BaseModel):
    id: int
    product_id: int
    composition_id: int
    planned_quantity: float
    completed_quantity: float
    target_location_id: Optional[int] = None
    target_location_name: Optional[str] = None
    status: str
    calculated_unit_cost: Optional[float] = None
    pw_stock_document_id: Optional[int] = None
    product_name: Optional[str] = None
    product_sku: Optional[str] = None
    composition_name: Optional[str] = None
    notes: Optional[str] = None


class ProductionBatchCreateBody(BaseModel):
    warehouse_id: int = Field(..., ge=1)
    notes: Optional[str] = None
    status: ProductionBatchStatus = "planned"
    lines: List[ProductionBatchLineWrite] = Field(default_factory=list)


class ProductionBatchRead(BaseModel):
    id: int
    tenant_id: int
    number: str
    warehouse_id: int
    warehouse_name: Optional[str] = None
    status: ProductionBatchStatus
    notes: Optional[str] = None
    rw_stock_document_id: Optional[int] = None
    rw_document_number: Optional[str] = None
    operator_name: Optional[str] = None
    lines: List[ProductionBatchLineRead] = Field(default_factory=list)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BatchAggregatedPickLineRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    required: float
    available: float
    missing: float
    suggested_locations: List[ProductionLocationSuggestionRead] = Field(default_factory=list)
    auto_allocation: List[ProductionAllocationRead] = Field(default_factory=list)


class ProductionBatchPickPlanRead(BaseModel):
    batch_id: int
    warehouse_id: int
    shortages: List[StockShortageRead] = Field(default_factory=list)
    has_shortages: bool = False
    aggregated_components: List[BatchAggregatedPickLineRead] = Field(default_factory=list)
    product_lines: List[ProductionBatchLineRead] = Field(default_factory=list)


class ProductionBatchCompleteBody(BaseModel):
    component_allocations: Optional[List[ComponentAllocationWrite]] = None
    line_completions: Optional[List[dict]] = None  # [{line_id, completed_quantity, target_location_id}]


class ProductionBatchCompleteResultRead(BaseModel):
    batch: ProductionBatchRead
    rw_stock_document_id: Optional[int] = None
    rw_document_number: Optional[str] = None
    component_total_cost: Optional[float] = None
