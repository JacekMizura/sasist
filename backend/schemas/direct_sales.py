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
