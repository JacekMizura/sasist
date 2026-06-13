"""API schemas for per-warehouse product slotting."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SlottingLocationEntry(BaseModel):
    locationUUID: str = Field(..., min_length=1)
    quantity: float = Field(default=0, ge=0)
    locationAddress: Optional[str] = None
    storageType: Optional[str] = None


class ProductWarehouseSlottingRead(BaseModel):
    product_id: int
    warehouse_id: int
    tenant_id: int
    assigned_locations: List[SlottingLocationEntry]


class ProductWarehouseSlottingPutBody(BaseModel):
    assigned_locations: List[SlottingLocationEntry] = Field(default_factory=list)


class WarehouseSlottingBulkItem(BaseModel):
    product_id: int
    assigned_locations: List[SlottingLocationEntry]


class WarehouseSlottingBulkRead(BaseModel):
    warehouse_id: int
    tenant_id: int
    items: List[WarehouseSlottingBulkItem]
