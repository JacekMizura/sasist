"""WMS pick-face replenishment from buffer (MM) + task queue."""

from __future__ import annotations

import math
from datetime import datetime
from typing import List, Optional, Tuple

from pydantic import BaseModel, Field, field_validator

from ..services.warehouse_product_operation_log_service import ALLOWED_PACKAGING_TYPES
from .stock_document import StockDocumentRead


class WmsReplenishmentSourceAllocation(BaseModel):
    """Planowany pobór z jednej lokalizacji BUFFER w ramach jednego pick face."""

    location_id: int
    quantity: float = Field(..., gt=0, description="Szacowana ilość do pobrania z tej lokacji")


class WmsReplenishmentBufferSource(BaseModel):
    """BUFFER location with stock — ``quantity`` gross on location; ``moveable_quantity`` po rezerwie minimalnej."""

    location_id: int
    location_name: str = ""
    quantity: float = 0.0
    moveable_quantity: Optional[float] = Field(
        default=None,
        description="Ilość dostępna do pobrania po odjęciu min. rezerwy zapasowej produktu.",
    )


class WmsReplenishmentLineRead(BaseModel):
    product_id: int
    product_name: str = ""
    product_sku: str | None = None
    product_ean: str | None = None
    product_image_url: str | None = None
    pick_location_id: int
    pick_location_name: str = ""
    pick_stock: float = 0.0
    min_level: float
    missing_qty: float
    buffer_location_id: int
    buffer_location_name: str = ""
    buffer_stock_at_source: float = 0.0
    suggested_qty: float = 0.0
    buffer_sources: list[WmsReplenishmentBufferSource] = Field(
        default_factory=list,
        description="BUFFER locations with stock for this product.",
    )
    source_allocations: List[WmsReplenishmentSourceAllocation] = Field(
        default_factory=list,
        description="Łańcuch planowanych pobrań (kolejność) przy uzupełnianiu tego pick face.",
    )
    priority_score: float = 0.0
    priority_band: str = "LOW"
    open_orders_qty: float = 0.0
    today_sales_velocity: float = 0.0


class WmsReplenishmentExecuteBody(BaseModel):
    warehouse_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    from_location_id: int = Field(..., ge=1, description="Buffer (source)")
    to_location_id: int = Field(..., ge=1, description="Pick (target)")
    quantity: float = Field(..., gt=0)
    packaging_type: str = Field(default="UNIT", max_length=24)
    packaging_quantity: float | None = Field(default=None)
    wms_mode: str | None = Field(default=None, max_length=64)

    @field_validator("quantity")
    @classmethod
    def qty_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        return v

    @field_validator("packaging_type")
    @classmethod
    def packaging_norm(cls, v: str) -> str:
        t = (v or "UNIT").strip().upper()
        if t not in ALLOWED_PACKAGING_TYPES:
            raise ValueError("packaging_type must be UNIT, CARTON, or MASTER_PACK")
        return t

    @field_validator("packaging_quantity")
    @classmethod
    def pkg_qty_finite(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not math.isfinite(v) or v <= 0:
            raise ValueError("packaging_quantity must be positive finite or null")
        return v


class WmsReplenishmentExecuteResult(BaseModel):
    document: StockDocumentRead
    task_completed: bool = False


class WmsReplenishmentTaskSourceSegment(BaseModel):
    """Jeden segment łańcucha źródeł BUFFER w zadaniu uzupełnienia."""

    location_id: int
    location_code: str = ""
    quantity_planned: float
    quantity_done: float = 0.0


class WmsReplenishmentTaskRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    product_id: int
    source_location_id: int
    target_location_id: int
    quantity: float
    priority_score: float = 0.0
    priority_band: str = "LOW"
    status: str = "OPEN"
    created_at: datetime | None = None
    completed_at: datetime | None = None
    assigned_admin_id: int | None = None

    product_name: str = ""
    product_sku: str | None = None
    product_ean: str | None = None
    product_image_url: str | None = None

    source_location_code: str = ""
    target_location_code: str = ""

    pick_stock: float = 0.0
    reserve_stock: float = 0.0
    min_pick_level: float | None = None
    max_pick_level: float | None = None

    sources: List[WmsReplenishmentTaskSourceSegment] = Field(
        default_factory=list,
        description="Łańcuch BUFFER — kolejność poboru.",
    )

    warehouse_zone: str = ""
    location_sort: Tuple[str, str, str, str] = ("", "", "", "")
    days_of_cover: float | None = None


class WmsReplenishmentTaskExecuteBody(BaseModel):
    """Wykonanie pojedynczego MM z wybranej lokacji BUFFER (jeden segment łańcucha)."""

    from_location_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    packaging_type: str = Field(default="UNIT", max_length=24)
    packaging_quantity: float | None = Field(default=None)
    wms_mode: str | None = Field(default=None, max_length=64)

    @field_validator("quantity")
    @classmethod
    def qty_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        return v

    @field_validator("packaging_type")
    @classmethod
    def packaging_norm(cls, v: str) -> str:
        t = (v or "UNIT").strip().upper()
        if t not in ALLOWED_PACKAGING_TYPES:
            raise ValueError("packaging_type must be UNIT, CARTON, or MASTER_PACK")
        return t

    @field_validator("packaging_quantity")
    @classmethod
    def pkg_qty_finite(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not math.isfinite(v) or v <= 0:
            raise ValueError("packaging_quantity must be positive finite or null")
        return v


class WmsReplenishmentTaskGenerateResult(BaseModel):
    created: int
    skipped_existing: int = Field(
        ...,
        description="Zadania już zsynchronizowane (bez zmian ilości / priorytetu).",
    )
    updated: int = Field(default=0, description="Istniejące OPEN / IN_PROGRESS zaktualizowane.")
    removed: int = Field(default=0, description="Automatycznie usunięte zadania, których stan już nie wymaga uzupełnienia.")
