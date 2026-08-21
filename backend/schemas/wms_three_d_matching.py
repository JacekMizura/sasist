"""WMS 3D Matching history API schemas."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class WmsThreeDMatchingHistoryItemOut(BaseModel):
    id: int
    order_id: int
    order_number: Optional[str] = None
    trigger: str
    strategy: str
    three_d_enabled_snapshot: bool = True
    filler_percent_snapshot: float = 0.0
    shipping_method_id: Optional[str] = None
    shipping_method_name: Optional[str] = None
    result_status: str
    result_label: str
    suggested_carton_id: Optional[str] = None
    suggested_carton_name: Optional[str] = None
    selected_carton_id: Optional[str] = None
    selected_carton_name: Optional[str] = None
    fill_percent: Optional[float] = None
    candidate_count: int = 0
    compatible_candidate_count: int = 0
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    composition_items: list[dict[str, Any]] = Field(default_factory=list)
    triggered_by_user_id: Optional[int] = None
    triggered_by_display: Optional[str] = None
    created_at: Optional[str] = None
    selected_at: Optional[str] = None


class WmsThreeDMatchingHistoryPageOut(BaseModel):
    page: int
    limit: int
    total: int
    items: list[WmsThreeDMatchingHistoryItemOut] = Field(default_factory=list)
