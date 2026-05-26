"""Schemas for PickTask (enterprise pick task). Backward-compatible shape for UI."""

from datetime import date

from pydantic import BaseModel, ConfigDict
from typing import Optional


class PickRead(BaseModel):
    """Pick task read (id, order, product, location, quantity, cart_id, status). Backward compat: inventory_unit_id omitted (null)."""
    id: int
    tenant_id: int
    order_id: int
    product_id: int
    location_id: int
    quantity: float
    batch_number: str = ""
    expiry_date: Optional[date] = None
    cart_id: Optional[int] = None
    status: str  # waiting | picking | picked
    inventory_unit_id: Optional[int] = None  # legacy; not used in enterprise model

    model_config = ConfigDict(from_attributes=True)


class PickListRead(PickRead):
    """With optional display names from joins."""
    product_name: Optional[str] = None
    location_name: Optional[str] = None
    order_number: Optional[str] = None


class PickCompleteBody(BaseModel):
    """Optional quantity to pick (default: full task quantity). Optional picker_id for Pick event."""
    quantity: Optional[float] = None
    picker_id: Optional[int] = None
