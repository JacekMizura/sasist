"""Response shapes for GET /purchasing/dashboard."""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class PurchasingKpisOut(BaseModel):
    critical_products: int = Field(..., description="Stock <= 0 or below min_total_stock when set.")
    out_of_stock_in_7_days: int = Field(..., description="Positive avg daily sales and cover days in (0, 7].")
    suggested_orders_count: int = Field(..., description="Products with suggested replenishment qty >= 1.")
    suggested_purchase_value: float = Field(..., description="Sum of suggested_qty * buy_price over suggested lines.")
    active_suppliers: int = Field(..., description="Suppliers with active=True for tenant.")
    deliveries_in_pipeline: int = Field(
        ...,
        description="Deliveries in draft/ordered/in_transit (not received/cancelled).",
    )


class CriticalProductRowOut(BaseModel):
    product_id: int
    product_name: str
    sku: Optional[str] = None
    stock: float
    avg_daily_sales: float
    days_cover: Optional[float] = None
    supplier_name: Optional[str] = None


class SuggestedOrderRowOut(BaseModel):
    product_id: int
    product_name: str
    suggested_qty: float
    supplier_name: Optional[str] = None
    buy_price: Optional[float] = None
    estimated_cost: float


class RecentDeliveryRowOut(BaseModel):
    id: int
    document_no: str
    supplier_name: str
    status: str
    created_at: Optional[datetime] = None


class PurchasingDashboardOut(BaseModel):
    kpis: PurchasingKpisOut
    critical_products: List[CriticalProductRowOut]
    suggested_orders: List[SuggestedOrderRowOut]
    recent_orders: List[RecentDeliveryRowOut]
