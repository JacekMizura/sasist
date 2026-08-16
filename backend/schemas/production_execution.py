"""Unified WMS production execution projection (batch + MO)."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field

from .production_batch import CollectionJobHeaderRead, CollectionTaskRead

ProductionExecutionKind = Literal["batch", "order"]
ProductionExecutionPhase = Literal["collecting", "execute", "putaway"]
ProductionExecutionStatus = Literal[
    "draft",
    "planned",
    "collecting",
    "in_progress",
    "awaiting_putaway",
    "putaway",
    "completed",
    "cancelled",
]


class ProductionExecutionJobRead(BaseModel):
    """Read-only projection for WMS queue and future unified terminal."""

    kind: ProductionExecutionKind
    id: int
    number: str
    warehouse_id: int
    status: ProductionExecutionStatus
    phase: Optional[ProductionExecutionPhase] = None
    product_label: str = ""
    product_image_url: Optional[str] = None
    product_sku: Optional[str] = None
    product_ean: Optional[str] = None
    product_catalog_number: Optional[str] = None
    product_barcode: Optional[str] = None
    product_unit: Optional[str] = None
    planned_quantity: float = 0.0
    completed_quantity: float = 0.0
    progress_percent: float = 0.0
    has_shortages: bool = False
    is_released_to_wms: bool = False
    released_to_wms_at: Optional[datetime] = None
    operator_name: Optional[str] = None
    created_at: Optional[datetime] = None


class OrderCollectionStateRead(BaseModel):
    order_id: int
    status: str
    header: CollectionJobHeaderRead
    tasks: List[CollectionTaskRead] = Field(default_factory=list)
    collected_count: int = 0
    total_count: int = 0
    progress_percent: float = 0.0


class OrderProductionProgressBody(BaseModel):
    add_quantity: float = Field(..., gt=0)
    fg_batch_number: Optional[str] = None
    fg_expiry_date: Optional[date] = None
    fg_serial_numbers: List[str] = Field(default_factory=list)
    idempotency_key: Optional[str] = Field(None, max_length=191)


class OrderProductionFinishBody(BaseModel):
    fg_batch_number: Optional[str] = None
    fg_expiry_date: Optional[date] = None
    fg_serial_numbers: List[str] = Field(default_factory=list)


class OrderPutawayBody(BaseModel):
    target_location_id: int = Field(..., ge=1)
