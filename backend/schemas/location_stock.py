"""Location stock API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class LocationStockSummary(BaseModel):
    available: float = 0.0
    reserved: float = 0.0
    picking: float = 0.0


class LocationStockRow(BaseModel):
    location_id: int
    code: str
    type: str = "NORMAL"
    operational_zone_type: str | None = None
    available: float = 0.0
    on_hand: float = 0.0
    reserved: float = 0.0
    picking: float = 0.0
    sales_priority: int = 100
    picking_priority: int = 100


class LocationStockResponse(BaseModel):
    product_id: int
    warehouse_id: int
    tenant_id: int | None = None
    as_of: str | None = None
    revision: str | None = None
    summary: LocationStockSummary
    locations: list[LocationStockRow] = Field(default_factory=list)
