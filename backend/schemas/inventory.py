"""
Schemas for InventoryUnit (multi-tenant stock with reservations).
available_quantity = quantity - reserved_quantity.
"""

from datetime import date
from pydantic import BaseModel, ConfigDict


class InventoryUnitRead(BaseModel):
    id: int
    tenant_id: int
    product_id: int
    warehouse_id: int
    location_id: int
    quantity: float
    reserved_quantity: float
    available_quantity: float
    batch: str | None = None
    serial_number: str | None = None
    expiration_date: date | None = None

    model_config = ConfigDict(from_attributes=True)


class InventoryReadWithNames(InventoryUnitRead):
    tenant_name: str | None = None
    product_name: str | None = None
    warehouse_name: str | None = None
    location_name: str | None = None


class InventoryCreate(BaseModel):
    tenant_id: int
    product_id: int
    warehouse_id: int
    location_id: int
    quantity: float = 0
    reserved_quantity: float = 0
    batch: str | None = None
    serial_number: str | None = None
    expiration_date: date | None = None


class InventoryUpdate(BaseModel):
    quantity: float | None = None
    reserved_quantity: float | None = None
