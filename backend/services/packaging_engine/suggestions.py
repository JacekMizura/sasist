"""Wewnętrzny model roboczy silnika (przed mapowaniem na schemat API)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

PackagingEngineSource = Literal["SMART_MATCHING", "THREE_D_MATCHING", "COMBINED"]


@dataclass
class PackagingSuggestionDraft:
    order_id: int
    source_engine: PackagingEngineSource
    suggested_package_id: str
    package_name: str
    package_dimensions: str
    image_url: str | None
    confidence_score: float
    fill_percentage: float | None
    reason: str
    auto_assigned: bool = False
    overridden_by_user: bool = False
    assigned_by: str | None = None
    assigned_at: datetime | None = None
    sort_key: float = field(default=0.0)
