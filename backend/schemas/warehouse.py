"""
SCHEMATY Warehouse
"""

from pydantic import BaseModel, ConfigDict


class WarehouseCreate(BaseModel):
    name: str


class WarehouseRead(BaseModel):
    id: int
    name: str
    address: str | None = None
    type: str | None = None
    tenant_id: int | None = None

    model_config = ConfigDict(from_attributes=True)
