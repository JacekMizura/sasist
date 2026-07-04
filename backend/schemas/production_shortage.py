"""Production shortage & substitute API schemas."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

MaterialProductionStatus = Literal["OK", "PARTIAL", "BLOCKED"]
ShortagePriority = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]


class MaterialLocationHintRead(BaseModel):
    location_id: int
    location_code: str
    available_qty: float


class SubstituteProposalRead(BaseModel):
    substitute_product_id: int
    substitute_product_name: str
    substitute_product_sku: Optional[str] = None
    priority: int
    conversion_ratio: float
    available_qty: float
    effective_qty: float
    can_cover_shortage: bool


class MaterialShortageDetailRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    required_qty: float
    available_qty: float
    missing_qty: float
    locations: list[MaterialLocationHintRead] = Field(default_factory=list)
    expected_availability_date: Optional[str] = None
    substitute_proposals: list[SubstituteProposalRead] = Field(default_factory=list)


class MaterialAnalysisRead(BaseModel):
    planned_quantity: float
    material_status: MaterialProductionStatus
    producible_now_qty: float
    waiting_qty: float
    has_shortages: bool
    components: list[MaterialShortageDetailRead] = Field(default_factory=list)


class MaterialAnalysisRequest(BaseModel):
    composition_id: int = Field(..., ge=1)
    planned_quantity: float = Field(..., gt=0)


class ProductionShortageQueueRowRead(BaseModel):
    component_product_id: int
    product_name: str
    product_sku: Optional[str] = None
    missing_qty: float
    required_qty: Optional[float] = None
    available_qty: Optional[float] = None
    blocked_batches_count: int
    blocked_orders_count: int
    blocked_batch_ids: list[int] = Field(default_factory=list)
    blocked_order_ids: list[int] = Field(default_factory=list)
    priority: ShortagePriority
    locations: list[MaterialLocationHintRead] = Field(default_factory=list)
    expected_availability_date: Optional[str] = None
    substitute_proposals: list[SubstituteProposalRead] = Field(default_factory=list)


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
