"""API schematy dla ``picking_config`` (WMS — reguły zbierania)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

PickingConfigStrategy = Literal["locations", "orders"]
PickingConfigMode = Literal["bulk", "scanned", "baskets", "mobile"]
PickingConfigPickUnit = Literal["orders", "products"]
PickingConfigOrderSort = Literal["date", "location", "courier"]


class PickingConfigRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    source_status_id: int
    target_status_id: int
    status_on_shortage_id: Optional[int] = Field(default=None, description="Status po zgłoszeniu braku (WMS)")
    strategy: PickingConfigStrategy
    pick_unit: PickingConfigPickUnit
    order_sort: PickingConfigOrderSort
    single_mode: PickingConfigMode
    multi_mode: PickingConfigMode
    max_single_orders: Optional[int] = Field(default=None, ge=1)
    max_multi_orders: Optional[int] = Field(default=None, ge=1)
    created_at: datetime
    source_status_name: Optional[str] = None
    target_status_name: Optional[str] = None
    status_on_shortage_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class PickingConfigCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    source_status_id: int = Field(..., ge=1)
    target_status_id: int = Field(..., ge=1)
    status_on_shortage_id: Optional[int] = Field(default=None, ge=1)
    strategy: PickingConfigStrategy
    pick_unit: Optional[PickingConfigPickUnit] = None
    order_sort: Optional[PickingConfigOrderSort] = None
    single_mode: PickingConfigMode
    multi_mode: PickingConfigMode
    max_single_orders: Optional[int] = Field(default=None, ge=1)
    max_multi_orders: Optional[int] = Field(default=None, ge=1)

    @model_validator(mode="after")
    def source_not_target(self) -> "PickingConfigCreate":
        if int(self.source_status_id) == int(self.target_status_id):
            raise ValueError("source_status_id i target_status_id muszą się różnić.")
        return self


class PickingConfigUpdate(BaseModel):
    """PUT — bez zmiany ``tenant_id``, ``warehouse_id``, ``source_status_id``."""

    target_status_id: int = Field(..., ge=1)
    status_on_shortage_id: Optional[int] = Field(default=None, ge=1)
    strategy: PickingConfigStrategy
    pick_unit: Optional[PickingConfigPickUnit] = None
    order_sort: Optional[PickingConfigOrderSort] = None
    single_mode: PickingConfigMode
    multi_mode: PickingConfigMode
    max_single_orders: Optional[int] = Field(default=None, ge=1)
    max_multi_orders: Optional[int] = Field(default=None, ge=1)


class PickingConfigListResponse(BaseModel):
    items: list[PickingConfigRead]
