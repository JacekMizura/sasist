"""Schemas: WMS cart occupancy stats (SSOT)."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class WmsCartCurrentTaskOut(BaseModel):
    task_type: str
    task_id: Optional[int] = None
    batch_id: Optional[int] = None
    operator_id: Optional[int] = None
    started_at: Optional[str] = None
    progress: float = 0.0
    total_orders: int = 0
    total_products: int = 0
    picked_count: int = 0
    remaining_count: int = 0


class WmsCartStatsOut(BaseModel):
    orders_count: int = Field(0, ge=0)
    products_count: int = Field(0, ge=0)
    sections_count: int = Field(0, ge=0)
    occupied_sections: int = Field(0, ge=0)
    volume_used: float = Field(0.0, ge=0)
    percent_used: float = Field(0.0, ge=0)
    status: Optional[str] = None
    current_task: Optional[WmsCartCurrentTaskOut] = None


class WmsCartLifecycleHistoryItemOut(BaseModel):
    id: int
    cart_id: int
    from_status: Optional[str] = None
    to_status: str
    operator_user_id: Optional[int] = None
    changed_at: Optional[str] = None
    reason: str
    task_type: Optional[str] = None
    task_id: Optional[int] = None
    batch_id: Optional[int] = None


class WmsCartLifecycleHistoryOut(BaseModel):
    cart_id: int
    items: list[WmsCartLifecycleHistoryItemOut]
