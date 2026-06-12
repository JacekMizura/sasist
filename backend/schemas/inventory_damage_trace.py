"""Damage trace metadata exposed on inventory rows (location tooltips)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class InventoryDamageTraceOut(BaseModel):
    damage_class: Optional[str] = Field(None, description="B or C when known")
    damage_reasons: List[str] = Field(default_factory=list, description="Human-readable reason labels")
    source_reference: Optional[str] = Field(None, description="RMZ-xxxx or REK-xxxx")
    source_kind: Optional[str] = Field(None, description="RMZ | COMPLAINT")
    decided_at: Optional[datetime] = None
    operator_name: Optional[str] = None
    disposition_badge: Optional[str] = Field(None, description="USZKODZONY B / USZKODZONY C / USZKODZONY")
    stock_disposition: Optional[str] = None
