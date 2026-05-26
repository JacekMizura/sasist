"""API schemas for WMS operational tasks."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class WmsOperationalTaskRef(BaseModel):
    order_id: int
    order_item_id: int
    qty: float = 0.0


class WmsOperationalRelocationAllocation(BaseModel):
    order_id: int
    order_item_id: int
    qty: float = 0.0
    target_zone: Optional[str] = None
    order_number: Optional[str] = None
    carrier_id: Optional[int] = None
    carrier_label: Optional[str] = None
    relocated_qty: float = 0.0
    remaining_qty: float = 0.0
    relocated_at: Optional[datetime] = None
    relocated_by: Optional[int] = None
    done: bool = False
    status: str = Field(default="pending", description="pending | partial | done")


class WmsOperationalTaskListItem(BaseModel):
    id: int
    task_type: str
    status: str
    queue: str
    product_id: Optional[int] = None
    product_name: str = ""
    product_sku: Optional[str] = None
    product_ean: Optional[str] = None
    image_url: Optional[str] = None
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    order_item_id: Optional[int] = None
    quantity_required: float = 0.0
    quantity_done: float = 0.0
    quantity_remaining: float = 0.0
    location_hint: Optional[str] = None
    substitute_product_id: Optional[int] = None
    substitute_for_product_name: Optional[str] = None
    group_key: str = ""
    priority: int = 0
    summary_line: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    # RELOCATION (product batch queue)
    picked_from_location: Optional[str] = None
    relocation_order_count: int = 0
    relocation_allocation_count: int = 0
    target_zones: List[str] = Field(default_factory=list)
    waiting_order_count: int = 0
    waiting_oldest_at: Optional[datetime] = None


class WmsOperationalTaskDetail(WmsOperationalTaskListItem):
    payload_refs: List[WmsOperationalTaskRef] = Field(default_factory=list)
    related_order_numbers: List[str] = Field(default_factory=list)
    relocation_allocations: List[WmsOperationalRelocationAllocation] = Field(default_factory=list)
    relocation_allocations_total: int = 0
    relocation_total_qty: float = 0.0
    lock_version: int = 0
    relocation_session: Optional[WmsRelocationSessionState] = None
    relocation_history: List[WmsRelocationHistoryEntry] = Field(default_factory=list)
    operational_events: List[WmsRelocationHistoryEntry] = Field(default_factory=list)
    can_edit_relocation: bool = False
    active_carrier_stats: Optional[WmsRelocationCarrierStats] = None


class WmsOperationalQueueSummary(BaseModel):
    queue: str
    label: str
    count: int = 0


class WmsOperationalTaskListResponse(BaseModel):
    items: List[WmsOperationalTaskListItem] = Field(default_factory=list)
    total: int = 0
    queue_summaries: List[WmsOperationalQueueSummary] = Field(default_factory=list)


class WmsOperationalTaskActionResponse(BaseModel):
    ok: bool = True
    task_id: int
    status: str


class WmsOperationalRelocationCompleteBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    quantity_done: Optional[float] = None


class WmsOperationalRelocationAssignBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    order_id: int = Field(..., ge=1)
    order_item_id: int = Field(..., ge=1)
    carrier_id: int = Field(..., ge=1)
    qty: Optional[float] = Field(default=None, gt=0, description="Domyślnie: pozostała ilość linii")
    lock_version: Optional[int] = None


class WmsOperationalRelocationBulkAssignBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    carrier_id: int = Field(..., ge=1)
    order_item_ids: Optional[List[int]] = Field(
        default=None,
        description="Puste = wszystkie oczekujące alokacje",
    )
    lock_version: Optional[int] = None


class WmsRelocationSessionState(BaseModel):
    operator_id: int
    operator_name: str = ""
    device_id: Optional[str] = None
    started_at: Optional[str] = None
    last_activity_at: Optional[str] = None
    active_carrier_id: Optional[int] = None
    active_carrier_label: Optional[str] = None
    is_holder: bool = False
    is_expired: bool = False
    can_edit: bool = False
    can_takeover: bool = False


class WmsRelocationHistoryEntry(BaseModel):
    at: str
    action: str
    operator_id: int
    operator_name: str = ""
    qty: Optional[float] = None
    carrier_id: Optional[int] = None
    carrier_label: Optional[str] = None
    order_id: Optional[int] = None
    order_item_id: Optional[int] = None


class WmsRelocationSessionAcquireBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    device_id: Optional[str] = None
    takeover: bool = False


class WmsRelocationSessionReleaseBody(BaseModel):
    tenant_id: int = Field(..., ge=1)


class WmsRelocationCarrierStats(BaseModel):
    product_count: int = 0
    order_count: int = 0
    total_qty: float = 0.0


class WmsRelocationAllocationsPage(BaseModel):
    items: List[WmsOperationalRelocationAllocation] = Field(default_factory=list)
    total: int = 0
    offset: int = 0
    limit: int = 40
