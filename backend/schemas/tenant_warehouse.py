"""
SCHEMAS: TenantWarehouse (assignments)
"""

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TenantWarehouseCreate(BaseModel):
    tenant_id: int
    warehouse_id: int
    role: str = "operator"  # owner | client | operator
    is_default: bool = False
    participates_in_network_stock: bool = True
    fulfillment_eligible: bool = True
    fulfillment_priority: int = Field(default=100, ge=1, le=9999)


class TenantWarehouseUpdate(BaseModel):
    participates_in_network_stock: bool | None = None
    fulfillment_eligible: bool | None = None
    fulfillment_priority: int | None = Field(default=None, ge=1, le=9999)


class TenantWarehouseRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    role: str
    is_default: bool
    participates_in_network_stock: bool = True
    fulfillment_eligible: bool = True
    fulfillment_priority: int = 100

    model_config = ConfigDict(from_attributes=True)

    @field_validator("is_default", mode="before")
    @classmethod
    def _coerce_is_default(cls, v: object) -> bool:
        if isinstance(v, bool):
            return v
        try:
            return int(v or 0) == 1
        except (TypeError, ValueError):
            return bool(v)

    @field_validator("participates_in_network_stock", "fulfillment_eligible", mode="before")
    @classmethod
    def _coerce_bool(cls, v: object) -> bool:
        if isinstance(v, bool):
            return v
        if v is None:
            return True
        try:
            return int(v) != 0
        except (TypeError, ValueError):
            return bool(v)
