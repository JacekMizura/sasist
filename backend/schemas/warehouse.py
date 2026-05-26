"""
SCHEMATY Warehouse
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WarehouseCreate(BaseModel):
    name: str


class WarehouseUpdate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)


class WarehouseRead(BaseModel):
    id: int
    name: str
    address: str | None = None
    type: str | None = None
    tenant_id: int | None = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
