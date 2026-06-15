"""Warehouse context API schemas."""

from __future__ import annotations

from pydantic import BaseModel, Field


class WarehouseBrief(BaseModel):
    id: int
    name: str
    requires_putaway: bool = True


class UserWarehouseAssignmentBrief(BaseModel):
    warehouse_id: int
    is_default: bool
    can_operate: bool


class WarehouseContextResponse(BaseModel):
    active_warehouse_id: int | None = None
    warehouses: list[WarehouseBrief] = Field(default_factory=list)
    show_warehouse_selector: bool = False
    assignments: list[UserWarehouseAssignmentBrief] = Field(default_factory=list)
    uses_legacy_all_warehouses: bool = False
    active_warehouse_requires_putaway: bool = True


class SetActiveWarehouseBody(BaseModel):
    warehouse_id: int = Field(..., ge=1)
