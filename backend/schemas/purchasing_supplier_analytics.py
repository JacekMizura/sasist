"""Response models for supplier performance scorecard API."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SupplierAnalyticsTrendPointOut(BaseModel):
    period: str
    score: Optional[float] = None


class SupplierAnalyticsPunctualityPointOut(BaseModel):
    period: str
    on_time_percent: Optional[float] = None


class SupplierAnalyticsOrderHistoryPointOut(BaseModel):
    period: str
    orders: int = 0
    value: float = 0.0


class SupplierAnalyticsSeriesOut(BaseModel):
    score_trend: List[SupplierAnalyticsTrendPointOut] = Field(default_factory=list)
    punctuality_trend: List[SupplierAnalyticsPunctualityPointOut] = Field(default_factory=list)
    order_history: List[SupplierAnalyticsOrderHistoryPointOut] = Field(default_factory=list)
    supplier_id: int
    supplier_name: str = ""


class SupplierAnalyticsRowOut(BaseModel):
    rank: int
    supplier_id: int
    supplier_name: str
    score: Optional[float] = None
    insufficient_data: bool = False
    active_products_count: int = 0
    total_orders: int = 0
    total_value: float = 0.0
    deliveries_count: int = 0
    planned_orders_count: int = 0
    total_purchase_value_net: float = 0.0
    total_purchase_value_gross: float = 0.0
    avg_delivery_interval: Optional[float] = None
    on_time_rate: Optional[float] = None
    price_trend: Optional[float] = None
    avg_lead_time_days: Optional[float] = None
    declared_lead_time_days: Optional[float] = None
    on_time_percent: Optional[float] = None
    avg_delay_days: Optional[float] = None
    partial_delivery_percent: Optional[float] = None
    cancelled_orders_count: int = 0
    avg_buy_price_change_percent: Optional[float] = None
    last_delivery_date: Optional[str] = None
    risk_level: str = "high"


class PurchasingSupplierAnalyticsOut(BaseModel):
    range_days: int
    rows: List[SupplierAnalyticsRowOut]
    series: Optional[SupplierAnalyticsSeriesOut] = None
