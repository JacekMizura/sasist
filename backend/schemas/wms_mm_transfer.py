"""WMS MM (internal location-to-location transfer)."""

from __future__ import annotations

import math
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from ..services.warehouse_product_operation_log_service import ALLOWED_PACKAGING_TYPES


class WmsMmResolveLocationOut(BaseModel):
    found: bool = False
    location_id: Optional[int] = None
    location_name: str = ""


class WmsMmLocationInventoryRow(BaseModel):
    product_id: int
    product_name: str = ""
    product_ean: Optional[str] = None
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    quantity_total: float = 0.0
    track_batch: bool = False
    track_expiry: bool = False
    units_per_carton: Optional[float] = None


class WmsMmCreateTransferBody(BaseModel):
    warehouse_id: int = Field(..., ge=1)
    from_location_id: int = Field(..., ge=1)
    to_location_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    packaging_type: str = Field(default="UNIT", max_length=24, description="UNIT | CARTON | MASTER_PACK")
    packaging_quantity: Optional[float] = Field(default=None, description="Liczba skanów (np. kartonów); jednostki zwykle = quantity.")
    wms_mode: Optional[str] = Field(default=None, max_length=64, description="Tryb WMS / kanał (np. mobile).")

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
    def pkg_qty_finite(cls, v: Optional[float]) -> Optional[float]:
        if v is None:
            return None
        if not math.isfinite(v) or v <= 0:
            raise ValueError("packaging_quantity must be positive finite or null")
        return v


class WmsMmDraftAppendBody(BaseModel):
    """Append or merge a line on draft MM (no stock movement)."""

    warehouse_id: int = Field(..., ge=1)
    from_location_id: int = Field(..., ge=1)
    product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)

    @field_validator("quantity")
    @classmethod
    def qty_finite(cls, v: float) -> float:
        if not math.isfinite(v):
            raise ValueError("quantity must be finite")
        return v