"""Response shapes for GET /purchasing/replenishment."""

from typing import List, Optional

from pydantic import BaseModel, Field


class ReplenishmentSummaryOut(BaseModel):
    total_rows: int
    total_suggested_value: float = Field(..., description="Sum of estimated_order_value where suggested_qty >= 1.")
    critical_count: int
    suggested_count: int = Field(..., description="Rows with suggested_qty >= 1.")
    low_stock_count: int = Field(0, description="Rows flagged as low stock (non-critical short cover).")


class ReplenishmentRowOut(BaseModel):
    product_id: int
    image_url: Optional[str] = None
    product_name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    category_name: Optional[str] = None
    supplier_id: Optional[int] = None
    supplier_name: Optional[str] = None
    current_stock: float
    incoming_qty: float
    sales_30d: float
    avg_daily_sales: float
    stock_cover_days: Optional[float] = None
    min_stock: Optional[float] = None
    suggested_qty: float
    buy_price: Optional[float] = None
    landed_cost_net: Optional[float] = None
    extra_cost_net: Optional[float] = None
    sell_price: Optional[float] = None
    margin_value: Optional[float] = None
    margin_percent: Optional[float] = None
    estimated_order_value: float
    critical_flag: bool
    low_stock_flag: bool = Field(..., description="Non-critical short cover (see core.is_low_stock).")
    product_unit: Optional[str] = Field(None, description="Jednostka magazynowa produktu (wyświetlanie / zaokrąglenie).")


class ReplenishmentListOut(BaseModel):
    rows: List[ReplenishmentRowOut]
    summary: ReplenishmentSummaryOut
    page: int
    page_size: int
