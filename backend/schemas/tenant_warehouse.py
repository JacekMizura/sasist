"""
SCHEMAS: TenantWarehouse (assignments)
"""

from pydantic import BaseModel, ConfigDict


class TenantWarehouseCreate(BaseModel):
    tenant_id: int
    warehouse_id: int
    role: str = "operator"  # owner | client | operator
    is_default: bool = False


class TenantWarehouseRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    role: str
    is_default: bool

    model_config = ConfigDict(from_attributes=True)
