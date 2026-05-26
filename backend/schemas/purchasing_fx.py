"""FX helpers for purchasing (manual override + list)."""

from __future__ import annotations

from datetime import date
from typing import List, Optional

from pydantic import BaseModel, Field


class FxManualRateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    currency: str = Field(..., max_length=8)
    rate_date: date
    rate_to_pln: float = Field(..., gt=0, description="PLN za 1 jednostkę waluty obcej.")


class FxRateRowOut(BaseModel):
    id: int
    tenant_id: Optional[int] = None
    currency: str
    rate_date: str
    rate_to_pln: float
    source: str


class FxRateListOut(BaseModel):
    rows: List[FxRateRowOut] = Field(default_factory=list)
