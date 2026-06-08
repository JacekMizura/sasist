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


class InventoryDashboardKpisRead(BaseModel):
    active_inventories: int
    awaiting_approval: int
    open_differences: int
    completed_last_7_days: int
    warehouse_coverage_percent: int
    active_operator_sessions: int


class InventoryDashboardRead(BaseModel):
    kpis: InventoryDashboardKpisRead
    active_inventories: list[InventoryDocumentRead]
    awaiting_approval: list[InventoryDocumentRead]
    recent_completed: list[InventoryDocumentRead]


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
