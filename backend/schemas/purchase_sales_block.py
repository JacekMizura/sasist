"""Purchase PZ line sales block — API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from ..services.purchase_sales_block_constants import SALES_BLOCK_REASON_CODES


class PatchPurchaseSalesBlockBody(BaseModel):
    sales_blocked_qty: Optional[float] = Field(None, ge=0)
    sales_block_reason_code: Optional[str] = Field(None, max_length=64)
    sales_block_note: Optional[str] = None

    @field_validator("sales_block_reason_code")
    @classmethod
    def _normalize_reason(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip().upper()
        return s or None


class PurchaseSalesBlockLineRead(BaseModel):
    sales_blocked_qty: float = 0.0
    sales_block_effective_qty: float = 0.0
    sales_block_reason_code: Optional[str] = None
    sales_block_reason_label: Optional[str] = None
    sales_block_note: Optional[str] = None
    sales_blocked_at: Optional[datetime] = None
    sales_blocked_by_user_id: Optional[int] = None
    line_commercial_available_qty: float = 0.0
    line_remaining_qty: float = 0.0


class ProductCommercialAvailabilityOut(BaseModel):
    commercially_sellable_qty: float = Field(
        0,
        ge=0,
        description="saleable_available_qty minus effective purchase-line sales blocks",
    )
    sales_blocked_qty: float = Field(
        0,
        ge=0,
        description="Effective sales block total (not raw sum of line blocks)",
    )


SALES_BLOCK_REASON_OPTIONS = sorted(SALES_BLOCK_REASON_CODES)
