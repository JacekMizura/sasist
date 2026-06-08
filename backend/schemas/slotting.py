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
