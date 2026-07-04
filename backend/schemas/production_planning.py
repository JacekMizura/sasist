"""Production demand planning API schemas."""

from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

ProductionPlanningPriority = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
CoverageColor = Literal["red", "orange", "green", "blue"]


class ProductionDemandSummaryRead(BaseModel):
    order_demand_total: float = 0.0
    order_production_needed: float = 0.0
    forecast_production_needed: float = 0.0
    combined_production_needed: float = 0.0
    on_hand_total: float = 0.0
    in_pipeline_total: float = 0.0


class ProductionDemandProductRowRead(BaseModel):
    product_id: int
    composition_id: Optional[int] = None
    product_name: str
    product_sku: Optional[str] = None
    product_image_url: Optional[str] = None
    on_hand: float = 0.0
    avg_daily_sales: float = 0.0
    coverage_days: Optional[float] = None
    coverage_color: CoverageColor = "blue"
    in_pipeline: float = 0.0
    order_demand: float = 0.0
    forecast_demand: float = 0.0
    forecast_production_needed: float = 0.0
    order_production_needed: float = 0.0
    combined_production_needed: float = 0.0
    priority: ProductionPlanningPriority = "LOW"


class ProductionDemandPlanningRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    coverage_days: int
    sales_lookback_days: int
    coverage_day_presets: List[int] = Field(default_factory=list)
    summary: ProductionDemandSummaryRead
    products: List[ProductionDemandProductRowRead] = Field(default_factory=list)
