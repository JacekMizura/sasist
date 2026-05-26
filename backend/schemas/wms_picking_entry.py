"""WMS picking entry: workload per panel order UI status."""

from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from .order import OrderUiMainGroup


class WmsPickingStatusWorkloadRow(BaseModel):
    order_ui_status_id: int
    name: str
    color: str
    main_group: OrderUiMainGroup
    sort_order: int = 0
    total_orders: int = 0
    in_progress_orders: int = 0


class WmsPickingStatusWorkloadResponse(BaseModel):
    statuses: List[WmsPickingStatusWorkloadRow] = Field(default_factory=list)
