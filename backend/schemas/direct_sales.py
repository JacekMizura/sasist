"""Direct sales / operational sales API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from .commerce_enums import (
    DirectSaleSessionStatus,
    FulfillmentMode,
    IssueStrategy,
    OrderChannel,
    ReservationScope,
)


class DirectSaleSessionLineRead(BaseModel):
    id: int
    product_id: int
    quantity: float
    unit_price: float | None = None
    discount_amount: float = 0.0
    source_location_id: int | None = None
    suggested_location_id: int | None = None
    sort_order: int = 0
    product_name: str | None = None
    product_sku: str | None = None
    product_ean: str | None = None
    image_url: str | None = None
    source_location_code: str | None = None
    operational_zone_type: str | None = None
    available_qty_hint: float | None = None
    has_reservation: bool = False


class DirectSaleProductSearchHit(BaseModel):
    product_id: int
    name: str
    sku: str | None = None
    ean: str | None = None
    image_url: str | None = None
    unit_price: float | None = None
    available_qty: float = 0.0
    preferred_location_id: int | None = None
    preferred_location_code: str | None = None
    operational_zone_type: str | None = None


class DirectSaleAddProductBody(BaseModel):
    product_id: int = Field(..., ge=1)
    quantity: float = Field(1.0, gt=0)
    source_location_id: int | None = None


class DirectSaleLinePatchBody(BaseModel):
    quantity: float | None = Field(None, gt=0)
    source_location_id: int | None = None


class DirectSaleSessionRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    operator_user_id: int | None = None
    workstation_id: int | None = None
    operational_zone_id: int | None = None
    status: DirectSaleSessionStatus
    order_id: int | None = None
    issue_strategy: IssueStrategy = "STRICT_LOCATION"
    reservation_scope: ReservationScope = "SESSION"
    started_at: datetime | None = None
    suspended_at: datetime | None = None
    last_activity_at: datetime | None = None
    completed_at: datetime | None = None
    customer_id: int | None = None
    expires_at: datetime | None = None
    payment_context: dict | None = None
    lines: list[DirectSaleSessionLineRead] = Field(default_factory=list)


class DirectSaleSessionCreateBody(BaseModel):
    workstation_id: int | None = None
    operational_zone_id: int | None = None
    issue_strategy: IssueStrategy = "STRICT_LOCATION"
    reservation_scope: ReservationScope = "SESSION"


class DirectSaleScanBody(BaseModel):
    code: str = Field(..., min_length=1, description="EAN / SKU / internal scan")
    quantity: float = Field(1.0, gt=0)
    source_location_id: int | None = None


class DirectSaleScanResponse(BaseModel):
    session_id: int
    line_id: int
    product_id: int
    quantity: float
    suggested_locations: list[dict] = Field(default_factory=list)


class DirectSaleSetCustomerBody(BaseModel):
    customer_id: int | None = None


class DirectSaleStartPaymentBody(BaseModel):
    payment_method: str = Field("CASH", max_length=24)


class DirectSaleCompleteBody(BaseModel):
    payment_method: str = Field("CASH", max_length=24)
    document_subtype: str = Field("RECEIPT", description="RECEIPT or INVOICE")


class DirectSaleCompleteResponse(BaseModel):
    session_id: int
    order_id: int
    payment_id: int
    document_job_id: int | None = None
    document_number: str | None = None
    total_amount: float
    payment_status: str | None = None
    payment_method: str | None = None
