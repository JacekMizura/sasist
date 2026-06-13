"""P5 — order consolidation API schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class WarehouseFeasibilityRead(BaseModel):
    warehouse_id: int
    warehouse_name: str
    total_lines: int
    available_lines: int
    missing_units: float
    skus_to_pull: int


class ConsolidationFeasibilityRead(BaseModel):
    order_id: int
    tenant_id: int
    warehouses: List[WarehouseFeasibilityRead] = Field(default_factory=list)
    best_consolidation_candidate: Optional[int] = None
    best_consolidation_candidate_name: Optional[str] = None
    single_warehouse_fulfillment_id: Optional[int] = None
    single_warehouse_fulfillment_name: Optional[str] = None
    manual_review_required: bool = False
    message: Optional[str] = None


class GenerateConsolidationPlanResponse(BaseModel):
    outcome: str
    message: Optional[str] = None
    plan_id: Optional[int] = None
    target_warehouse_id: Optional[int] = None
    target_warehouse_name: Optional[str] = None
    feasibility: Optional[dict] = None


class ConsolidationPlanItemRead(BaseModel):
    id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: float
    source_warehouse_id: int
    source_warehouse_name: Optional[str] = None
    target_warehouse_id: int
    target_warehouse_name: Optional[str] = None
    status: str
    stock_document_id: Optional[int] = None


class ConsolidationPlanRead(BaseModel):
    id: int
    order_id: int
    order_number: Optional[str] = None
    target_warehouse_id: int
    target_warehouse_name: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    shelf_label: Optional[str] = None
    segment_id: Optional[int] = None
    mm_staged_count: int = 0
    mm_staging_total: int = 0
    mm_staging_label: str = "—"
    local_staged_count: int = 0
    local_staging_total: int = 0
    local_staging_label: str = "—"
    packing_ready: bool = False
    packing_ready_label: str = "NIEGOTOWE"
    transfers_received: int = 0
    transfers_total: int = 0
    progress_label: str = "—"
    pending_source_warehouses: List[str] = Field(default_factory=list)
    items: List[ConsolidationPlanItemRead] = Field(default_factory=list)


class ConsolidationPlanListRow(BaseModel):
    id: int
    order_id: int
    order_number: str
    target_warehouse_id: int
    target_warehouse_name: Optional[str] = None
    status: str
    created_at: Optional[str] = None
    transfers_received: int = 0
    transfers_total: int = 0
    progress_label: str = "—"
    pending_source_warehouses: List[str] = Field(default_factory=list)


class ConsolidationPlanListOut(BaseModel):
    plans: List[ConsolidationPlanListRow] = Field(default_factory=list)


class ConsolidationSummaryOut(BaseModel):
    pending_count: int = 0
    in_progress_count: int = 0
    completed_count: int = 0
    active_count: int = 0
    exception_count: int = 0
    manual_review_count: int = 0
    problem_plan_count: int = 0
    critical_alert_count: int = 0
    unresolved_alert_count: int = 0


class ChangeTargetWarehouseRequest(BaseModel):
    warehouse_id: int = Field(..., ge=1)
    reason: str = Field(..., min_length=1)


class CancelConsolidationRequest(BaseModel):
    reason: str = Field(..., min_length=1)


class RecoveryActionRequest(BaseModel):
    action: str = Field(..., min_length=1)
    note: str | None = None


class ConsolidationAlertRead(BaseModel):
    id: int
    plan_id: int
    plan_item_id: int | None = None
    order_id: int
    order_number: str
    plan_status: str
    severity: str
    code: str
    message: str
    resolved: bool
    created_at: str | None = None


class ConsolidationAlertListOut(BaseModel):
    alerts: List[ConsolidationAlertRead] = Field(default_factory=list)


class ConsolidationActionResponse(BaseModel):
    plan_id: int
    status: str
    message: str | None = None


class GenerateMmDraftsResponse(BaseModel):
    plan_id: int
    documents_created: int
    items_updated: int


class ConsolidationStagingQueueRow(BaseModel):
    id: int
    order_id: int
    order_number: str
    status: str
    transfers_received: int = 0
    transfers_total: int = 0
    progress_label: str = "—"
    staged_count: int = 0
    staging_total: int = 0
    staging_label: str = "—"
    shelf_label: Optional[str] = None
    segment_id: Optional[int] = None
    can_start_staging: bool = False


class ConsolidationStagingQueueOut(BaseModel):
    plans: List[ConsolidationStagingQueueRow] = Field(default_factory=list)


class StartStagingResponse(BaseModel):
    plan_id: int
    status: str
    segment_id: int
    shelf_label: str
    message: Optional[str] = None


class StageItemResponse(BaseModel):
    plan_id: int
    plan_item_id: int
    status: str
    completed: bool = False
    plan_status: Optional[str] = None


class ResolveShelfResponse(BaseModel):
    segment_id: int
    shelf_label: str
    order_id: int
    order_number: Optional[str] = None
    packing_ready: bool = False
