"""Operational delivery work queue — open PZ needing warehouse work (not Supply Flow plan)."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

QueuePriority = Literal["urgent", "first", "next", "later"]
WorkPhase = Literal["receiving", "putaway"]


class DeliveryWorkQueueItemOut(BaseModel):
    pz_id: int
    document_number: str
    document_type: str
    supplier_name: str | None = None
    delivery_id: int | None = None
    delivery_name: str | None = None
    status_label: str
    warehouse_workflow_status: str
    receiving_status: str
    putaway_status: str
    line_count: int = 0
    quantity_ordered: float = 0
    quantity_received: float = 0
    expected_date: datetime | None = None
    created_at: datetime | None = None
    queue_sort: int
    priority: QueuePriority = "later"
    work_phase: WorkPhase
    started: bool = False
    cta_label: str
    cta_path: str


class DeliveryWorkQueueOut(BaseModel):
    tenant_id: int
    warehouse_id: int
    items: list[DeliveryWorkQueueItemOut] = Field(default_factory=list)
    total: int = 0


class DeliveryWorkQueueReorderBody(BaseModel):
    ordered_pz_ids: list[int] = Field(default_factory=list, min_length=1)


class DeliveryWorkQueuePriorityBody(BaseModel):
    priority: QueuePriority
