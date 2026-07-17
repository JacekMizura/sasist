"""Schemas: WMS cart occupancy + Active Picking + Event Log."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class WmsCartActivePickingOut(BaseModel):
    """Aktywna kompletacja — snapshot z backendu (nie encja Task)."""

    phase: str
    session_id: Optional[int] = None
    batch_id: Optional[int] = None
    operator_id: Optional[int] = None
    started_at: Optional[str] = None
    progress: float = 0.0
    total_orders: int = 0
    total_products: int = 0
    confirmed_products: int = 0
    remaining_products: int = 0
    # Legacy aliases (FE / starsze klienty)
    task_type: Optional[str] = None
    task_id: Optional[int] = None
    picked_count: Optional[int] = None
    remaining_count: Optional[int] = None


# Alias kompatybilności
WmsCartCurrentTaskOut = WmsCartActivePickingOut


class WmsCartStatsOut(BaseModel):
    orders_count: int = Field(0, ge=0)
    products_count: int = Field(0, ge=0)
    sections_count: int = Field(0, ge=0)
    occupied_sections: int = Field(0, ge=0)
    volume_used: float = Field(0.0, ge=0)
    percent_used: float = Field(0.0, ge=0)
    status: Optional[str] = None
    active_picking: Optional[WmsCartActivePickingOut] = None
    current_task: Optional[WmsCartActivePickingOut] = None  # alias = active_picking


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


class WmsCartLifecycleEventOut(BaseModel):
    id: int
    cart_id: int
    event_type: str
    description: str
    operator_user_id: Optional[int] = None
    operator_name: Optional[str] = None
    occurred_at: Optional[str] = None
    session_id: Optional[int] = None
    batch_id: Optional[int] = None
    order_id: Optional[int] = None
    metadata: Optional[dict[str, Any]] = None


class WmsCartLifecycleEventsOut(BaseModel):
    cart_id: int
    items: list[WmsCartLifecycleEventOut]
