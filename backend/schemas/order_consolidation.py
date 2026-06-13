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


class GenerateMmDraftsResponse(BaseModel):
    plan_id: int
    documents_created: int
    items_updated: int
