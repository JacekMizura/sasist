"""Warehouse-scoped printing feature flags."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class PrintingWarehouseSettingsRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    prefer_sasist_agent: bool = False

    model_config = ConfigDict(from_attributes=True)


class PrintingWarehouseSettingsUpdate(BaseModel):
    prefer_sasist_agent: bool | None = Field(default=None)
