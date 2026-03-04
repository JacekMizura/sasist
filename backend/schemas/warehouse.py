"""
SCHEMATY Warehouse
"""

from pydantic import BaseModel


class WarehouseCreate(BaseModel):
    name: str


class WarehouseRead(BaseModel):
    id: int
    name: str
    tenant_id: int

    class Config:
        from_attributes = True
