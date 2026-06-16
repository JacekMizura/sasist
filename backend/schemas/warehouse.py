"""
SCHEMATY Warehouse
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class WarehouseCreate(BaseModel):
    name: str


class WarehouseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    requires_putaway: bool | None = Field(
        None,
        description="True = WMS z DOCK-IN i putaway; False = magazyn prosty (STOCK)",
    )


class WarehouseRead(BaseModel):
    id: int
    name: str
    address: str | None = None
    type: str | None = None
    tenant_id: int | None = None
    requires_putaway: bool = True
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
