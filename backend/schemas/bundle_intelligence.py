"""P4.18 — Bundle warehouse intelligence API schemas."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class BundleKpiRowRead(BaseModel):
    bundle_id: int
    bundle_name: str
    units_sold: int
    revenue_net: float
    margin_net: Optional[float] = None
    margin_percent: Optional[float] = None
    returns_count: int
    complaints_count: int
    avg_pick_seconds: Optional[float] = None
    avg_pack_seconds: Optional[float] = None
    avg_consolidation_seconds: Optional[float] = None
    growth_percent: Optional[float] = None


class BundleDashboardRead(BaseModel):
    period_days: int
    top_bundles: List[BundleKpiRowRead]
    fastest_growing: List[BundleKpiRowRead]
    highest_margin: List[BundleKpiRowRead]
    most_returns: List[BundleKpiRowRead]


class BundleSlottingPairRead(BaseModel):
    product_a_id: int
    product_a_name: str
    product_a_sku: Optional[str] = None
    product_b_id: int
    product_b_name: str
    product_b_sku: Optional[str] = None
    co_occurrence_rate: float
    bundles_together_count: int
    bundles_with_a_count: int
    location_a: Optional[str] = None
    location_b: Optional[str] = None
    recommendation: str
    priority: str


class BundleReplenishmentRowRead(BaseModel):
    bundle_id: int
    bundle_name: str
    bundle_qty_forecast: float
    product_id: int
    product_name: str
    sku: Optional[str] = None
    qty_per_bundle: float
    total_component_qty: float
    recommendation: str


class BundleReplenishmentBody(BaseModel):
    bundle_qty_forecast: Optional[dict[int, float]] = None
    horizon_weeks: float = Field(1.0, ge=0.1, le=52)
    velocity_period_days: int = Field(30, ge=7, le=365)


class BundleCapacityCartRead(BaseModel):
    cart_id: int
    cart_code: Optional[str] = None
    total_volume_dm3: float
    used_volume_dm3: float
    utilization_percent: float
    bundle_orders_count: int
    recommendation: str


class BundleCapacityRackRead(BaseModel):
    rack_id: int
    rack_name: str
    segment_label: Optional[str] = None
    fill_percent: float
    order_id: Optional[int] = None
    has_bundle: bool
    recommendation: str


class BundleCapacityReportRead(BaseModel):
    cart_rows: List[BundleCapacityCartRead]
    rack_rows: List[BundleCapacityRackRead]
    overloaded_carts: int
    overloaded_rack_segments: int
