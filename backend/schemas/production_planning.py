"""Production demand planning API schemas."""

from __future__ import annotations

from typing import Any, List, Literal, Optional

from pydantic import BaseModel, Field

ProductionPlanningPriority = Literal["CRITICAL", "HIGH", "MEDIUM", "LOW"]
MaterialProductionStatus = Literal["OK", "PARTIAL", "BLOCKED"]
CoverageColor = Literal["red", "orange", "green", "blue"]
ForecastStrategyKey = Literal[
    "PERIOD_AVERAGE",
    "WEIGHTED_AVERAGE",
    "WEEKDAY_AVERAGE",
    "MEDIAN",
    "MAX_DAILY",
    "AI_SMART",
]


class ProductionPlanningDashboardRead(BaseModel):
    critical_products: int = 0
    production_needed_today: int = 0
    material_shortage_products: int = 0
    total_recommended_quantity: float = 0.0
    average_coverage_days: Optional[float] = None
    order_demand_total: float = 0.0


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
    min_stock: Optional[float] = None
    max_stock: Optional[float] = None
    production_moq: Optional[float] = None
    production_batch_multiple: Optional[float] = None
    production_lead_time_days: int = 0
    max_producible: float = 0.0
    material_status: MaterialProductionStatus = "OK"
    producible_now_qty: float = 0.0
    waiting_qty: float = 0.0
    recommended_quantity: float = 0.0
    order_production_needed: float = 0.0
    combined_production_needed: float = 0.0
    priority: ProductionPlanningPriority = "LOW"
    recommendation_reasons: List[str] = Field(default_factory=list)
    timeline: List[dict[str, Any]] = Field(default_factory=list)


class ProductionDemandPlanningRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    coverage_days: int
    sales_lookback_days: int
    forecast_strategy: str
    forecast_strategy_label: str = ""
    coverage_day_presets: List[int] = Field(default_factory=list)
    forecast_strategies: List[dict[str, str]] = Field(default_factory=list)
    dashboard: ProductionPlanningDashboardRead = Field(default_factory=ProductionPlanningDashboardRead)
    products: List[ProductionDemandProductRowRead] = Field(default_factory=list)


class ProductionPlanSimulationMaterialRead(BaseModel):
    component_product_id: int
    component_name: str
    required_total: float
    available: float
    shortage: float


class ProductionPlanSimulationLineRead(BaseModel):
    product_id: int
    product_name: str
    composition_id: int
    requested_quantity: float
    simulated_quantity: float
    material_shortages: List[dict[str, Any]] = Field(default_factory=list)
    projected_on_hand: float = 0.0
    projected_coverage_days: Optional[float] = None
    estimated_completion_date: Optional[str] = None
    remains_critical: bool = False


class ProductionPlanSimulationRead(BaseModel):
    tenant_id: int
    warehouse_id: int
    coverage_days: int
    forecast_strategy: str
    lines: List[ProductionPlanSimulationLineRead] = Field(default_factory=list)
    materials: List[ProductionPlanSimulationMaterialRead] = Field(default_factory=list)
    products_still_critical: int = 0
    estimated_completion_date: Optional[str] = None
    total_simulated_quantity: float = 0.0


class ProductionPlanSimulateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    coverage_days: int = Field(21, ge=1, le=365)
    lines: Optional[List[dict[str, float | int]]] = None


class ProductionPlanCreateBatchesBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    coverage_days: int = Field(21, ge=1, le=365)
