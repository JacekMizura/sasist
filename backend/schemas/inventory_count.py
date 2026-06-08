"""Inventory count module — Pydantic DTOs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class InventoryDocumentFilters(BaseModel):
    zone_id: int | None = None
    aisle: str | None = None
    rack: str | None = None
    location_ids: list[int] = Field(default_factory=list)
    product_ids: list[int] = Field(default_factory=list)
    category_id: int | None = None
    brand_id: int | None = None
    abc_class: str | None = None


class InventoryDocumentStrategy(BaseModel):
    blind_count: bool = True
    visible_quantities: bool = False
    recount_required: bool = False
    lock_mode: str = "snapshot"
    scan_mode: str = "scan_increment"
    # Placeholders
    abc_cycle_automation: bool = False
    heatmap_scope: bool = False
    qr_session_enabled: bool = False
    confidence_scoring: bool = False


class InventoryDocumentCreateBody(BaseModel):
    warehouse_id: int
    inventory_type: str = "FULL"
    notes: str | None = None


class InventoryDocumentWizardUpdateBody(BaseModel):
    inventory_type: str | None = None
    filters: InventoryDocumentFilters | None = None
    count_mode: str | None = None
    lock_mode: str | None = None
    recount_required: bool | None = None
    scan_mode: str | None = None
    strategy: InventoryDocumentStrategy | None = None
    notes: str | None = None
    planned_start_at: datetime | None = None
    planned_end_at: datetime | None = None


class InventoryGenerateTasksBody(BaseModel):
    location_ids: list[int] = Field(default_factory=list)


class InventorySubmitReadinessRead(BaseModel):
    can_submit: bool
    block_code: str | None = None
    block_message: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)


class InventoryDocumentRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    number: str
    inventory_type: str
    status: str
    count_mode: str
    lock_mode: str
    recount_required: bool
    scan_mode: str
    filters: dict[str, Any] = Field(default_factory=dict)
    strategy: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    notes: str | None = None
    planned_start_at: str | None = None
    planned_end_at: str | None = None
    snapshot_created_at: str | None = None
    approved_at: str | None = None
    posted_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None
    total_lines: int = 0
    counted_lines: int = 0
    difference_lines: int = 0
    coverage_percent: int = 0
    created_by_user_id: int | None = None
    approved_by_user_id: int | None = None
    created_at: str | None = None
    updated_at: str | None = None
    submit_readiness: InventorySubmitReadinessRead | None = None


class InventoryDashboardKpisRead(BaseModel):
    active_inventories: int
    awaiting_approval: int
    open_differences: int
    completed_last_7_days: int
    warehouse_coverage_percent: int
    active_operator_sessions: int


class InventoryDashboardSectionErrorRead(BaseModel):
    section: str
    error_type: str
    message: str
    traceback: str | None = None


class InventoryDashboardRead(BaseModel):
    kpis: InventoryDashboardKpisRead
    active_inventories: list[InventoryDocumentRead]
    awaiting_approval: list[InventoryDocumentRead]
    recent_completed: list[InventoryDocumentRead]
    difference_stats: dict[str, Any] = Field(default_factory=dict)
    heatmap_preview: list[dict[str, Any]] = Field(default_factory=list)
    operator_activity: list[dict[str, Any]] = Field(default_factory=list)
    dashboard_status: str = "ok"
    failed_sections: list[str] = Field(default_factory=list)
    section_errors: list[InventoryDashboardSectionErrorRead] = Field(default_factory=list)
    schema_audit: dict[str, Any] | None = None


class InventoryTaskRead(BaseModel):
    id: int
    inventory_document_id: int
    warehouse_id: int
    location_id: int
    location_code: str | None = None
    location_name: str | None = None
    task_number: str
    status: str
    priority: int
    assigned_user_id: int | None = None
    line_count: int = 0
    counted_line_count: int = 0
    progress_percent: int = 0
    sequence_no: int = 0
    zone_code: str | None = None
    aisle_code: str | None = None


class InventorySessionOpenBody(BaseModel):
    document_id: int
    task_id: int | None = None
    device_id: str | None = None


class InventorySessionRead(BaseModel):
    id: int
    inventory_document_id: int
    inventory_task_id: int | None = None
    warehouse_id: int
    user_id: int | None = None
    status: str
    device_id: str | None = None
    current_location_id: int | None = None
    scan_count: int = 0
    lines_counted: int = 0
    session_token: str | None = None
    started_at: str | None = None
    last_activity_at: str | None = None


class InventoryCountScanBody(BaseModel):
    line_id: int
    quantity: float | None = None
    delta: float | None = None
    barcode_value: str | None = None
    source: str = "scanner"
    expected_line_version: int | None = None
    device_id: str | None = None
    carrier_id: int | None = None


class InventoryCarrierResolveRead(BaseModel):
    carrier_id: int
    code: str
    barcode: str | None = None
    name: str | None = None
    current_location_id: int | None = None


class InventoryCountLineRead(BaseModel):
    id: int
    inventory_document_id: int
    location_id: int
    product_id: int
    expected_quantity: float | None = None
    counted_quantity: float | None = None
    difference_quantity: float | None = None
    status: str
    batch_number: str | None = None
    serial_number: str | None = None


class InventoryLocationConfirmBody(BaseModel):
    location_id: int
    scanned_code: str


class InventoryReportKindRead(BaseModel):
    kind: str
    label: str
    formats: list[str]
    status: str = "placeholder"


class InventoryReportsCatalogRead(BaseModel):
    reports: list[InventoryReportKindRead]


class InventoryLineRead(BaseModel):
    id: int
    location_id: int
    location_name: str | None = None
    product_id: int
    sku: str | None = None
    ean: str | None = None
    product_name: str | None = None
    expected_quantity: float | None = None
    counted_quantity: float | None = None
    difference_quantity: float | None = None
    status: str
    batch_number: str | None = None
    serial_number: str | None = None
    recount_count: int = 0
    confidence_score: float | None = None


class InventoryDifferenceLineRead(BaseModel):
    line_id: int
    location_id: int
    product_id: int
    sku: str | None = None
    expected_quantity: float | None = None
    counted_quantity: float | None = None
    difference_quantity: float | None = None
    difference_percent: float
    difference_class: str
    value_impact_net: float
    status: str


class InventoryDifferenceAnalysisRead(BaseModel):
    document_id: int
    thresholds: dict[str, float]
    summary: dict[str, int]
    total_value_impact_net: float
    lines: list[InventoryDifferenceLineRead]


class InventoryApprovalNotesBody(BaseModel):
    notes: str | None = None


class InventoryRecountCompleteBody(BaseModel):
    counted_quantity: float


class InventoryTaskCompactRead(BaseModel):
    id: int
    inventory_document_id: int
    warehouse_id: int
    location_id: int
    location_code: str | None = None
    location_name: str | None = None
    task_number: str
    status: str
    priority: int = 0
    assigned_user_id: int | None = None
    assigned_operator_name: str | None = None
    line_count: int = 0
    counted_line_count: int = 0
    progress_percent: int = 0
    sequence_no: int = 0
    zone_code: str | None = None
    aisle_code: str | None = None
    has_variance: bool = False
    recount_flag: bool = False
    unresolved: bool = False
    last_activity_at: str | None = None


class InventoryTaskPageRead(BaseModel):
    items: list[InventoryTaskCompactRead]
    total: int
    offset: int
    limit: int
    has_more: bool


class InventoryUniversalSearchRead(BaseModel):
    query: str
    locations: list[dict[str, Any]] = Field(default_factory=list)
    products: list[dict[str, Any]] = Field(default_factory=list)
    tasks: list[dict[str, Any]] = Field(default_factory=list)


class InventoryUnknownProductCreateBody(BaseModel):
    document_id: int
    task_id: int | None = None
    location_id: int
    temporary_name: str = Field(..., min_length=1, max_length=256)
    quantity: float = Field(default=1.0, gt=0)
    barcode_value: str | None = None
    notes: str | None = None
    photo_url: str | None = None


class InventoryUnknownProductRead(BaseModel):
    id: int
    inventory_document_id: int
    inventory_task_id: int | None = None
    warehouse_id: int
    location_id: int
    temporary_name: str
    barcode_value: str | None = None
    quantity: float
    notes: str | None = None
    photo_url: str | None = None
    status: str
    mapped_product_id: int | None = None
    reported_by_user_id: int | None = None
    created_at: str | None = None


class InventoryLocationExecutionSummaryRead(BaseModel):
    task_id: int
    location_id: int
    location_code: str | None = None
    blind_mode: bool = True
    progress_percent: int = 0
    line_count: int = 0
    counted_line_count: int = 0
    pending: list[dict[str, Any]] = Field(default_factory=list)
    counted: list[dict[str, Any]] = Field(default_factory=list)
    variance: list[dict[str, Any]] = Field(default_factory=list)
    unexpected: list[dict[str, Any]] = Field(default_factory=list)


class InventoryAuditQueuesRead(BaseModel):
    unresolved_anomalies: list[dict[str, Any]] = Field(default_factory=list)
    suspicious_variance: list[dict[str, Any]] = Field(default_factory=list)
    unknown_products: list[dict[str, Any]] = Field(default_factory=list)
    operator_productivity: list[dict[str, Any]] = Field(default_factory=list)
    recount_lines_count: int = 0
