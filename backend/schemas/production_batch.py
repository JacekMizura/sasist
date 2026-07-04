"""Production batch / wave schemas."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator

from .composition import AggregatedComponentDemandRead, CompositionLineRead
from .production import (
    ComponentAllocationWrite,
    ProductionAllocationRead,
    ProductionExecutionInterface,
    ProductionLocationSuggestionRead,
    StockShortageRead,
)

ProductionBatchStatus = Literal[
    "draft",
    "planned",
    "collecting",
    "in_progress",
    "putaway",
    "completed",
    "cancelled",
]


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
    product_image_url: Optional[str] = None
    composition_name: Optional[str] = None
    notes: Optional[str] = None


class ProductionBatchCreateBody(BaseModel):
    warehouse_id: int = Field(..., ge=1, description="Target warehouse for batch execution")
    notes: Optional[str] = None
    status: ProductionBatchStatus = "planned"
    reserve_materials: bool = False
    lines: List[ProductionBatchLineWrite] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_create_body(self) -> "ProductionBatchCreateBody":
        if int(self.warehouse_id) < 1:
            raise ValueError("warehouse_id is required")
        if not self.lines:
            raise ValueError("At least one batch line is required")
        for idx, ln in enumerate(self.lines):
            if int(ln.composition_id) < 1:
                raise ValueError(f"lines[{idx}].composition_id is required")
            if int(ln.product_id) < 1:
                raise ValueError(f"lines[{idx}].product_id is required")
            if float(ln.planned_quantity) <= 0:
                raise ValueError(f"lines[{idx}].planned_quantity must be > 0")
        return self


class ProductionBatchPreviewRead(BaseModel):
    has_shortages: bool = False
    total_planned_units: float = 0.0
    products_count: int = 0
    estimated_cost_net: float = 0.0
    estimated_duration_minutes: int = 0
    aggregated_components: List[BatchAggregatedPickLineRead] = Field(default_factory=list)
    shortages: List[StockShortageRead] = Field(default_factory=list)


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
    products_count: int = 0
    total_planned_units: float = 0.0
    total_completed_units: float = 0.0
    has_shortages: bool = False
    progress_percent: float = 0.0
    collection_progress_percent: float = 0.0
    released_to_wms_at: Optional[datetime] = None
    is_released_to_wms: bool = False
    execution_interface: Optional[ProductionExecutionInterface] = None
    is_erp_interface: bool = False
    materials_reserved: bool = False
    reservations_locked: bool = False
    started_at: Optional[datetime] = None
    collecting_completed_at: Optional[datetime] = None
    production_completed_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CollectionLocationLotRead(BaseModel):
    batch_number: Optional[str] = None
    lot: Optional[str] = None
    expiry_date: Optional[str] = None
    production_date: Optional[str] = None
    serial_number: Optional[str] = None
    available_qty: float = 0.0


class CollectionLocationOptionRead(BaseModel):
    location_id: int
    location_code: str
    operational_zone_type: Optional[str] = None
    storage_type: Optional[str] = None
    badge_kind: Optional[str] = None
    available_qty: float = 0.0
    is_preferred: bool = False
    lots: List[CollectionLocationLotRead] = Field(default_factory=list)


class CollectionOutputProductRead(BaseModel):
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    planned_quantity: float


class CollectionJobHeaderRead(BaseModel):
    job_number: str
    job_kind: Literal["batch", "order"]
    outputs: List[CollectionOutputProductRead] = Field(default_factory=list)


class CollectionTaskRead(BaseModel):
    task_key: str
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    product_ean: Optional[str] = None
    product_catalog_number: Optional[str] = None
    product_unit: Optional[str] = None
    required_qty: float
    collected_qty: float = 0.0
    selected_location_id: Optional[int] = None
    warehouse_total_available: Optional[float] = None
    location_options: List[CollectionLocationOptionRead] = Field(default_factory=list)
    # Flat mirror for legacy clients / finish_collecting
    location_id: int = 0
    location_code: str = ""
    available_qty: Optional[float] = None
    selected_batch_number: Optional[str] = None
    selected_lot: Optional[str] = None
    selected_serial_number: Optional[str] = None
    track_serial: bool = False


class BatchCollectionStateRead(BaseModel):
    batch_id: int
    status: str
    header: CollectionJobHeaderRead
    tasks: List[CollectionTaskRead] = Field(default_factory=list)
    collected_count: int = 0
    total_count: int = 0
    progress_percent: float = 0.0


class BatchCollectionUpdateBody(BaseModel):
    task_key: str
    collected_qty: float = Field(..., ge=0)
    location_id: Optional[int] = Field(None, ge=1)
    batch_number: Optional[str] = None
    lot: Optional[str] = None
    serial_number: Optional[str] = None


class BatchProductionProgressBody(BaseModel):
    line_id: int = Field(..., ge=1)
    add_quantity: float = Field(..., gt=0)


class BatchPutawayLineBody(BaseModel):
    line_id: int = Field(..., ge=1)
    target_location_id: int = Field(..., ge=1)
    quantity: Optional[float] = Field(None, gt=0)


class BatchPutawayBody(BaseModel):
    lines: List[BatchPutawayLineBody] = Field(default_factory=list)


class BatchAggregatedPickLineRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
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


class BulkProductionCardsBody(BaseModel):
    batch_ids: List[int] = Field(..., min_length=1, max_length=100)
