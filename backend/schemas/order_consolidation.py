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


class ConsolidationRackSegmentDashboardRow(BaseModel):
    segment_id: int
    slot_label: str
    shelf_label: str
    state: str
    fill_percent: float = 0.0
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    order_status: Optional[str] = None
    plan_id: Optional[int] = None
    plan_status: Optional[str] = None
    fulfillment_state: Optional[str] = None
    packing_ready: bool = False
    packing_ready_label: Optional[str] = None
    completion_percent: float = 0.0
    mm_staging_label: Optional[str] = None
    local_staging_label: Optional[str] = None


class ConsolidationRackLevelDashboardRow(BaseModel):
    level_id: int
    level_index: int
    level_name: Optional[str] = None
    is_segmented: bool = False
    segments: List[ConsolidationRackSegmentDashboardRow] = Field(default_factory=list)


class ConsolidationRackDashboardRow(BaseModel):
    rack_id: int
    rack_name: str
    levels: List[ConsolidationRackLevelDashboardRow] = Field(default_factory=list)


class ConsolidationRackDashboardSummary(BaseModel):
    total_segments: int = 0
    free_count: int = 0
    occupied_count: int = 0
    ready_to_pack_count: int = 0
    exception_count: int = 0
    remaining_percent: float = 0.0


class ConsolidationRackDashboardOut(BaseModel):
    warehouse_id: int
    racks: List[ConsolidationRackDashboardRow] = Field(default_factory=list)
    summary: ConsolidationRackDashboardSummary


class ConsolidationControlTowerMissingItem(BaseModel):
    plan_item_id: int
    product_id: int
    product_name: str
    source_warehouse_id: int
    source_warehouse_name: Optional[str] = None
    status: str


class ConsolidationControlTowerAlert(BaseModel):
    code: str
    severity: str
    label: str
    alert_id: Optional[int] = None


class ConsolidationControlTowerShelfRow(BaseModel):
    segment_id: int
    shelf_label: str
    order_id: int
    order_number: Optional[str] = None
    customer_name: Optional[str] = None
    plan_id: Optional[int] = None
    plan_status: Optional[str] = None
    order_status: Optional[str] = None
    target_warehouse_id: int
    target_warehouse_name: Optional[str] = None
    state: str
    sort_tier: int = 3
    occupied_since: Optional[str] = None
    occupied_minutes: Optional[int] = None
    occupied_label: Optional[str] = None
    ready_to_pack_since: Optional[str] = None
    ready_to_pack_minutes: Optional[int] = None
    ready_to_pack_label: Optional[str] = None
    mm_progress_label: Optional[str] = None
    local_progress_label: Optional[str] = None
    total_progress_label: Optional[str] = None
    missing_items: List[ConsolidationControlTowerMissingItem] = Field(default_factory=list)
    alerts: List[ConsolidationControlTowerAlert] = Field(default_factory=list)
    unresolved_alert_count: int = 0


class ConsolidationControlTowerKpi(BaseModel):
    total_segments: int = 0
    free_count: int = 0
    occupied_count: int = 0
    ready_to_pack_count: int = 0
    exception_count: int = 0
    avg_occupation_minutes: float = 0.0


class ConsolidationControlTowerOut(BaseModel):
    warehouse_id: int
    kpi: ConsolidationControlTowerKpi
    shelves: List[ConsolidationControlTowerShelfRow] = Field(default_factory=list)


class ConsolidationTowerAlertRow(BaseModel):
    plan_id: int
    order_id: int
    order_number: Optional[str] = None
    queue_status: Optional[str] = None
    shelf_label: Optional[str] = None
    waiting_minutes: Optional[int] = None
    code: str
    severity: str
    label: str
    alert_id: Optional[int] = None


class ConsolidationTowerCounts(BaseModel):
    READY_FOR_STAGING: int = 0
    STAGING: int = 0
    READY_TO_PACK: int = 0
    EXCEPTION: int = 0
    MANUAL_REVIEW_REQUIRED: int = 0


class ConsolidationTowerAvgMinutes(BaseModel):
    ready_for_staging_to_staging: Optional[float] = None
    staging_to_completed: Optional[float] = None
    completed_to_packing: Optional[float] = None


class ConsolidationTowerRackSummary(BaseModel):
    total_segments: int = 0
    occupied_segments: int = 0
    free_segments: int = 0
    occupancy_percent: float = 0.0


class ConsolidationTowerAlertCounts(BaseModel):
    warning: int = 0
    critical: int = 0


class ConsolidationTowerSummaryOut(BaseModel):
    warehouse_id: int
    counts: ConsolidationTowerCounts
    avg_minutes: ConsolidationTowerAvgMinutes
    rack_summary: ConsolidationTowerRackSummary
    alert_counts: ConsolidationTowerAlertCounts


class ConsolidationTowerReadyForStagingRow(BaseModel):
    plan_id: int
    order_id: int
    order_number: str
    target_warehouse_id: int
    target_warehouse_name: Optional[str] = None
    item_count: int = 0
    waiting_minutes: Optional[int] = None
    waiting_label: Optional[str] = None
    pending_source_warehouses: List[str] = Field(default_factory=list)
    plan_status: str
    queue_status: str = "READY_FOR_STAGING"
    alerts: List[ConsolidationControlTowerAlert] = Field(default_factory=list)


class ConsolidationTowerStagingRow(BaseModel):
    plan_id: int
    order_id: int
    order_number: str
    shelf_label: Optional[str] = None
    progress_percent: float = 0.0
    staged_count: int = 0
    pending_count: int = 0
    item_count: int = 0
    waiting_minutes: Optional[int] = None
    waiting_label: Optional[str] = None
    mm_progress_label: Optional[str] = None
    local_progress_label: Optional[str] = None
    last_activity_at: Optional[str] = None
    last_operator_name: Optional[str] = None
    plan_status: str
    queue_status: str = "STAGING"
    alerts: List[ConsolidationControlTowerAlert] = Field(default_factory=list)


class ConsolidationTowerReadyToPackRow(BaseModel):
    plan_id: int
    order_id: int
    order_number: str
    shelf_label: Optional[str] = None
    waiting_minutes: Optional[int] = None
    waiting_label: Optional[str] = None
    last_activity_at: Optional[str] = None
    last_operator_name: Optional[str] = None
    plan_status: str
    fulfillment_state: str = ""
    queue_status: str = "READY_TO_PACK"
    alerts: List[ConsolidationControlTowerAlert] = Field(default_factory=list)


class ConsolidationTowerBottleneckRow(BaseModel):
    plan_id: int
    order_id: int
    order_number: str
    queue_status: str
    waiting_minutes: Optional[int] = None
    waiting_label: Optional[str] = None
    shelf_label: Optional[str] = None
    alerts: List[ConsolidationControlTowerAlert] = Field(default_factory=list)


class ConsolidationTowerQueuesOut(BaseModel):
    warehouse_id: int
    ready_for_staging: List[ConsolidationTowerReadyForStagingRow] = Field(default_factory=list)
    staging: List[ConsolidationTowerStagingRow] = Field(default_factory=list)
    ready_to_pack: List[ConsolidationTowerReadyToPackRow] = Field(default_factory=list)
    bottlenecks: List[ConsolidationTowerBottleneckRow] = Field(default_factory=list)


class ConsolidationTowerSegmentRow(BaseModel):
    segment_id: int
    shelf_label: str
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    plan_status: Optional[str] = None
    occupied_minutes: Optional[int] = None
    occupied_label: Optional[str] = None
    state: str = "FREE"


class ConsolidationTowerRackRow(BaseModel):
    rack_id: int
    rack_name: str
    total_segments: int = 0
    occupied_segments: int = 0
    free_segments: int = 0
    occupancy_percent: float = 0.0
    segments: List[ConsolidationTowerSegmentRow] = Field(default_factory=list)


class ConsolidationTowerRacksOut(BaseModel):
    warehouse_id: int
    racks: List[ConsolidationTowerRackRow] = Field(default_factory=list)


class ConsolidationTowerAlertsOut(BaseModel):
    warehouse_id: int
    alerts: List[ConsolidationTowerAlertRow] = Field(default_factory=list)
