"""P4.16 — Bundle lot traceability API schemas."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class BundleLotSnapshotRead(BaseModel):
    lot_number: str = ""
    lot_id: Optional[int] = None
    expiry_date: Optional[str] = None
    picked_qty: float = Field(0, ge=0)
    picked_at: Optional[str] = None


class BundleTraceabilityComponentLotsRead(BaseModel):
    snapshot_id: int
    product_id: int
    product_name: str
    lots: list[BundleLotSnapshotRead] = Field(default_factory=list)


class BundleTraceabilityTreeRead(BaseModel):
    bundle_id: int
    bundle_name: str
    parent_order_line_id: int
    fulfillment_mode: str
    components: list[BundleTraceabilityComponentLotsRead] = Field(default_factory=list)


class LotToBundleHitRead(BaseModel):
    bundle_id: int
    bundle_name: str
    order_id: int
    order_number: str
    parent_order_line_id: int
    product_id: int
    product_name: str
    picked_qty: float
    lot_number: str
    expiry_date: Optional[str] = None


class LotToOrderHitRead(BaseModel):
    order_id: int
    order_number: str
    picked_qty_total: float = Field(0, ge=0)


class LotToCustomerHitRead(BaseModel):
    order_id: int
    order_number: str
    customer_name: str
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    lot_number: str
    bundle_name: str
    product_name: str
    picked_qty: float


class BundleRecallReportRead(BaseModel):
    lot_number: str
    bundles: list[dict]
    orders: list[dict]
    customers: list[dict]
    summary: dict


class LotTraceReportRowRead(BaseModel):
    lot_number: str
    bundle_id: int
    bundle_name: str
    order_id: int
    order_number: str
    customer_name: str
    product_id: int
    product_name: str
    picked_qty: float
    expiry_date: Optional[str] = None
