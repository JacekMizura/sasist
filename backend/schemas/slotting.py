"""Slotting / capacity API schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class CapacityCalculationRead(BaseModel):
    fits: bool
    max_units: float = 0
    max_cartons: float = 0
    remaining_units: float = 0
    remaining_volume_dm3: float = 0
    remaining_weight_kg: float = 0
    volume_utilization_percent: float = 0
    weight_utilization_percent: float = 0
    failure_reason: Optional[str] = None
    limiting_factor: Optional[str] = None
    method: Optional[str] = None
    confidence: Optional[str] = None
    explanation: Optional[str] = None


class ProductLocationCapacityRead(BaseModel):
    """SSOT capacity card for one product at one location (fit_engine projection)."""

    product_id: int
    location_id: int
    location_code: str = ""
    current_quantity: float = 0
    total_capacity: Optional[float] = None
    additional_capacity: Optional[float] = None
    utilization_percent: float = 0
    method: str = "UNKNOWN"
    confidence: str = "UNKNOWN"
    limiting_factor: Optional[str] = None
    limiting_factor_label: Optional[str] = None
    selected_orientation: int = 0
    stacks: int = 0
    units_per_stack: int = 0
    warnings: List[str] = Field(default_factory=list)
    explanation: str = ""
    additional_capacity_label: str = ""
    capacity_ratio_label: str = ""
    used_defaults: bool = False
    defaulted_fields: List[str] = Field(default_factory=list)
    geometry_source: str = "REAL_DATA"
    capacity_numeric_trusted: bool = True
    capacity_confidence: Optional[str] = None
    computational_additional_capacity: Optional[float] = None
    computational_total_capacity: Optional[float] = None
    planning_additional_capacity: Optional[float] = None


class LocationCapacityDetailRead(BaseModel):
    location_id: int
    location_code: str
    warehouse_id: int
    total_volume_dm3: float = 0
    total_weight_kg: float = 0
    occupied_volume_dm3: float = 0
    occupied_weight_kg: float = 0
    capacity_utilization_percent: float = 0
    fit: Optional[CapacityCalculationRead] = None
    #: Geometric / occupancy capacity for product_id (when provided)
    product_capacity: Optional[ProductLocationCapacityRead] = None


class BatchProductLocationCapacitiesBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    location_ids: List[int] = Field(..., min_length=1, max_length=80)
    packaging_mode: str = Field(default="UNIT")


class BatchProductLocationCapacitiesOut(BaseModel):
    product_id: int
    items: List[ProductLocationCapacityRead] = Field(default_factory=list)


class CalculateFitBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    location_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    quantity: float = Field(..., ge=0)
    packaging_mode: str = Field(default="UNIT", description="UNIT | CARTON")


class SuggestPutawayBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    packaging_mode: str = Field(default="UNIT")
    preferred_zone: Optional[str] = None
    strategy: str = Field(default="CONSOLIDATE_SKU")
    limit: int = Field(default=15, ge=1, le=50)


class PutawaySuggestionRead(BaseModel):
    location_id: int
    location_code: str
    score: float
    max_fit_quantity: float
    remaining_capacity_percent: float
    same_sku_present: bool
    reason_tags: List[str] = Field(default_factory=list)
    capacity: Optional[CapacityCalculationRead] = None
    product_capacity: Optional[ProductLocationCapacityRead] = None


class PutawayDistributionPlanBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    packaging_mode: str = Field(default="UNIT")
    exclude_location_ids: List[int] = Field(default_factory=list)


class PutawayDistributionAllocationRead(BaseModel):
    location_id: int
    location_code: str = ""
    current_quantity: float = 0
    total_capacity: float = 0
    additional_capacity: float = 0
    allocated_quantity: float = 0
    confidence: str = "UNKNOWN"
    reason: str = ""
    limiting_factor: Optional[str] = None
    limiting_factor_label: Optional[str] = None
    same_sku_present: bool = False
    used_defaults: bool = False
    defaulted_fields: List[str] = Field(default_factory=list)


class PutawayDistributionPlanRead(BaseModel):
    product_id: int
    warehouse_id: int
    requested_quantity: float
    allocated_quantity: float
    remaining_quantity: float
    method: str = "HEURISTIC_DISTRIBUTION"
    note: str = ""
    warnings: List[str] = Field(default_factory=list)
    allocations: List[PutawayDistributionAllocationRead] = Field(default_factory=list)


class RecalculateOccupancyBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    location_id: Optional[int] = Field(default=None, ge=1)
    warehouse_id: Optional[int] = Field(default=None, ge=1)


class OccupancyRecalcRead(BaseModel):
    location_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    locations_updated: int = 0
    occupied_volume_dm3: float = 0
    occupied_weight_kg: float = 0
    capacity_utilization_percent: float = 0
    capacity_state: Optional[str] = None


class HeatmapZoneRead(BaseModel):
    zone: str
    location_count: int
    avg_utilization_percent: float
    capacity_state: str


class HeatmapLocationRead(BaseModel):
    location_id: int
    location_code: str
    zone: str
    utilization_percent: float
    capacity_state: str
    occupied_volume_dm3: float = 0
    occupied_weight_kg: float = 0


class WarehouseHeatmapRead(BaseModel):
    warehouse_id: int
    zones: List[HeatmapZoneRead] = Field(default_factory=list)
    locations: List[HeatmapLocationRead] = Field(default_factory=list)
    state_counts: dict[str, int] = Field(default_factory=dict)
