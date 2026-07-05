"""Production shortage & substitute API schemas — MRP."""

from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

MaterialProductionStatus = Literal["OK", "PARTIAL", "BLOCKED"]
ShortagePriority = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class MaterialLotHintRead(BaseModel):
    location_id: int
    location_code: str
    batch_number: Optional[str] = None
    lot: Optional[str] = None
    expiry_date: Optional[str] = None
    on_hand_qty: float = 0.0
    reserved_qty: float = 0.0
    available_qty: float = 0.0


class SubstituteProposalRead(BaseModel):
    substitute_product_id: int
    substitute_product_name: str
    substitute_product_sku: Optional[str] = None
    substitute_product_image_url: Optional[str] = None
    priority: int
    conversion_ratio: float
    available_qty: float
    effective_qty: float
    can_cover_shortage: bool
    propose_use_substitute: bool = False
    technological_note: Optional[str] = None
    requires_user_acceptance: bool = True


class LimitingComponentRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    required_qty: Optional[float] = None
    available_qty: Optional[float] = None
    missing_qty: Optional[float] = None
    max_producible_qty: float = 0.0
    substitute_proposals: list[SubstituteProposalRead] = Field(default_factory=list)


class ProductionBlockMessageRead(BaseModel):
    title: str
    summary: str
    detail_lines: list[str] = Field(default_factory=list)
    can_start: bool = False
    material_status: MaterialProductionStatus
    planned_quantity: float = 0.0
    producible_now_qty: float = 0.0
    waiting_qty: float = 0.0
    limiting_component: Optional[LimitingComponentRead] = None


class MaterialShortageDetailRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    required_qty: float
    on_hand_qty: float = 0.0
    reserved_qty: float = 0.0
    available_qty: float
    missing_qty: float
    locations: list[MaterialLotHintRead] = Field(default_factory=list)
    expected_availability_date: Optional[str] = None
    substitute_proposals: list[SubstituteProposalRead] = Field(default_factory=list)


class MaterialAnalysisRead(BaseModel):
    composition_id: Optional[int] = None
    product_id: Optional[int] = None
    planned_quantity: float
    material_status: MaterialProductionStatus
    material_status_description: str = ""
    producible_now_qty: float
    waiting_qty: float
    has_shortages: bool
    can_start_production: bool = False
    limiting_component: Optional[LimitingComponentRead] = None
    block_message: Optional[ProductionBlockMessageRead] = None
    components: list[MaterialShortageDetailRead] = Field(default_factory=list)
    bom_explosion: Optional[dict[str, Any]] = None
    ai_recommendation_context: Optional[dict[str, Any]] = None


class MaterialAnalysisRequest(BaseModel):
    composition_id: int = Field(..., ge=1)
    planned_quantity: float = Field(..., gt=0)
    include_bom_explosion: bool = False
    include_ai_context: bool = False
    batch_id: Optional[int] = None
    order_id: Optional[int] = None


class FinishedProductShortageRead(BaseModel):
    product_id: Optional[int] = None
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    batch_id: Optional[int] = None
    order_id: Optional[int] = None
    kind: Optional[str] = None


class ProductionShortageQueueRowRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    required_qty: Optional[float] = None
    on_hand_qty: Optional[float] = None
    reserved_qty: Optional[float] = None
    available_qty: Optional[float] = None
    missing_qty: float
    blocked_batches_count: int
    blocked_orders_count: int
    blocked_batch_ids: list[int] = Field(default_factory=list)
    blocked_order_ids: list[int] = Field(default_factory=list)
    finished_products: list[FinishedProductShortageRead] = Field(default_factory=list)
    priority: ShortagePriority
    locations: list[MaterialLotHintRead] = Field(default_factory=list)
    expected_availability_date: Optional[str] = None
    substitute_proposals: list[SubstituteProposalRead] = Field(default_factory=list)


class MaterialPortfolioRowRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    recipe_usage_count: int = 0
    recipe_line_references: int = 0
    blocked_productions_count: int = 0
    on_hand_qty: float = 0.0
    reserved_qty: float = 0.0
    available_qty: float = 0.0
    forecast_daily_usage: float = 0.0
    forecast_depletion_date: Optional[str] = None


class MaterialSubstituteRead(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_sku: Optional[str] = None
    substitute_product_id: int
    substitute_product_name: str
    substitute_product_sku: Optional[str] = None
    priority: int
    conversion_ratio: float
    is_active: bool
    notes: Optional[str] = None


class MaterialSubstituteCreateBody(BaseModel):
    product_id: int = Field(..., ge=1)
    substitute_product_id: int = Field(..., ge=1)
    priority: int = Field(10, ge=1, le=999)
    conversion_ratio: float = Field(1.0, gt=0)
    is_active: bool = True
    notes: Optional[str] = None


class MaterialSubstituteUpdateBody(BaseModel):
    priority: Optional[int] = Field(None, ge=1, le=999)
    conversion_ratio: Optional[float] = Field(None, gt=0)
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class AcceptSubstituteBody(BaseModel):
    original_component_product_id: int = Field(..., ge=1)
    substitute_product_id: int = Field(..., ge=1)
    quantity_original: float = Field(..., gt=0)
    conversion_ratio: Optional[float] = Field(None, gt=0)
    batch_id: Optional[int] = None
    order_id: Optional[int] = None
    notes: Optional[str] = None


class SubstituteDecisionRead(BaseModel):
    id: int
    original_component_product_id: int
    substitute_product_id: int
    conversion_ratio: float
    quantity_original: float
    quantity_substitute: float
    status: str


class CreatePurchaseRequisitionBody(BaseModel):
    component_product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    supplier_id: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None
    batch_id: Optional[int] = None
    order_id: Optional[int] = None


class AddToPurchaseOrderBody(BaseModel):
    purchase_order_id: int = Field(..., ge=1)
    component_product_id: int = Field(..., ge=1)
    quantity: float = Field(..., gt=0)
    batch_id: Optional[int] = None
    order_id: Optional[int] = None


class PurchaseBridgeResultRead(BaseModel):
    purchase_order_id: int
    purchase_order_item_id: int
    material_need_id: int
    order_number: str
    status: str


class RecipeVariantRead(BaseModel):
    id: int
    product_id: int
    composition_id: int
    variant_code: str
    variant_label: str
    priority: int
    is_default: bool
    is_active: bool
    notes: Optional[str] = None


class MaterialNeedHistoryEventRead(BaseModel):
    event: str
    at: str
    status: str
    covered_qty: float = 0.0
    detail: dict = Field(default_factory=dict)


class ProductionMaterialNeedRead(BaseModel):
    id: int
    warehouse_id: int
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    shortage_qty: float
    covered_qty: float = 0.0
    status: str
    purchase_order_id: Optional[int] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    history: List[MaterialNeedHistoryEventRead] = Field(default_factory=list)
