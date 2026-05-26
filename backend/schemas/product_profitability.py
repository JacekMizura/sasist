from typing import List, Optional

from pydantic import BaseModel


class ProductProfitabilityRowOut(BaseModel):
    product_id: int
    image_url: Optional[str] = None
    sku: Optional[str] = None
    ean: Optional[str] = None
    product_name: str
    stock_qty: float
    sold_qty: float
    revenue_net: float
    cost_of_goods: float
    profit_value: float
    margin_percent: Optional[float] = None
    sale_gross: Optional[float] = None
    landed_cost_net: Optional[float] = None
    purchase_price: Optional[float] = None
    extra_cost_net: Optional[float] = None
    frozen_capital: float
    rotation: Optional[float] = None
    days_cover: Optional[float] = None
    status: str
    recommendations: List[str]


class ProductProfitabilitySummaryOut(BaseModel):
    revenue_net: float
    profit_gross: float
    avg_margin_percent: Optional[float] = None
    loss_products: int
    frozen_capital: float
    low_margin_products: int


class ProductProfitabilityPaginationOut(BaseModel):
    page: int
    page_size: int
    total: int


class ProductProfitabilityRangeOut(BaseModel):
    since: str
    until: str
    days: int


class ProductProfitabilityListOut(BaseModel):
    rows: List[ProductProfitabilityRowOut]
    summary: ProductProfitabilitySummaryOut
    pagination: ProductProfitabilityPaginationOut
    range: ProductProfitabilityRangeOut

