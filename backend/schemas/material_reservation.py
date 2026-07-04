"""Material reservation API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, Field


class MaterialReservationRead(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    location_id: int
    location_code: str
    quantity: float
    batch_number: Optional[str] = None
    lot: Optional[str] = None
    serial_number: Optional[str] = None
    expiry_date: Optional[str] = None
    status: str
    reservation_kind: Optional[str] = None
    document_kind: Optional[Literal["batch", "order"]] = None
    document_label: Optional[str] = None
    production_batch_id: Optional[int] = None
    production_order_id: Optional[int] = None
    warehouse_id: Optional[int] = None
    locked_at: Optional[str] = None
    created_at: Optional[str] = None
    operator_name: Optional[str] = None


class MaterialReservationUpdateBody(BaseModel):
    location_id: Optional[int] = Field(None, ge=1)
    quantity: Optional[float] = Field(None, gt=0)
    batch_number: Optional[str] = None
    serial_number: Optional[str] = None


class ProductionReservationSettings(BaseModel):
    allocation_strategy: Literal["FIFO", "FEFO", "LIFO"] = "FEFO"
