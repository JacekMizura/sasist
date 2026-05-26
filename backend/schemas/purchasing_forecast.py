"""Response shapes for GET /purchasing/forecast."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class ForecastSummaryOut(BaseModel):
    products_analyzed: int
    total_monthly_sales: float = Field(
        ...,
        description="Extrapolated monthly quantity: (sum qty in range_days) / range_days * 30.",
    )
    total_stock_value: float = Field(..., description="Sum of stock * unit cost (catalog / purchase price).")
    avg_stock_cover_days: Optional[float] = Field(None, description="Mean cover days where avg daily sales > 0.")
    risk_products_count: int = Field(..., description="Products with cover_days < 7 (finite cover).")
    dead_stock_count: int = Field(..., description="Products with stock > 0 and no sale in 60+ days.")


class SalesTrendPointOut(BaseModel):
    date: str
    qty: float
    revenue: float


class TopFastMovingOut(BaseModel):
    product_id: int
    name: str
    qty_30d: float


class TopRiskProductOut(BaseModel):
    product_id: int
    name: str
    stock: float
    avg_daily_sales: float
    cover_days: Optional[float] = None


class DeadStockOut(BaseModel):
    product_id: int
    name: str
    stock: float
    no_sales_days: int
    stock_value: float


class ForecastChartsOut(BaseModel):
    sales_trend: List[SalesTrendPointOut]
    top_fast_moving: List[TopFastMovingOut]
    top_risk_products: List[TopRiskProductOut]
    dead_stock: List[DeadStockOut]


class ProductBriefOut(BaseModel):
    id: int
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    image_url: Optional[str] = None


class LocationStockRowOut(BaseModel):
    warehouse_name: str
    location_name: str
    qty: float


class ProductForecastDetailOut(BaseModel):
    product: ProductBriefOut
    stock: float
    sales_7d: float
    sales_30d: float
    sales_90d: float
    avg_daily: float
    suggested_qty: float
    lead_time_days: Optional[int] = None
    supplier_name: Optional[str] = None
    forecast_30d: float
    trend_percent: Optional[float] = None
    unit: Optional[str] = None
    locations: List[LocationStockRowOut] = Field(default_factory=list)
    last_delivery_at: Optional[str] = Field(None, description="ISO datetime ostatniej przyjętej dostawy z tym towarem.")
    last_purchase_price: Optional[float] = Field(None, description="Ostatnia znana cena zakupu z linii dostawy (jeśli była wpisana).")
    purchase_unit_net_eur: Optional[float] = Field(None, description="Cena katalogowa netto w EUR u rozstrzygniętego dostawcy (gdy waluta EUR).")
    purchase_unit_net_pln: Optional[float] = Field(None, description="Szacunek ceny zakupu netto w PLN (EUR × kurs lub cena w PLN).")
    landed_cost_net: Optional[float] = Field(None, description="Łączny koszt netto (zakup + koszty dodatkowe produktu).")
    extra_cost_net: Optional[float] = Field(None, description="Koszty dodatkowe netto: pakowanie + inne + prowizja od ceny sprzedaży.")
    sale_pln_gross: Optional[float] = Field(None, description="Cena sprzedaży netto × 1,23 (symulacja brutto PL).")
    margin_percent: Optional[float] = Field(None, description="Marża %: (cena sprzedaży netto − landed_cost_net) / cena sprzedaży netto.")


class PurchasingForecastOut(BaseModel):
    summary: ForecastSummaryOut
    charts: ForecastChartsOut
    product_detail: Optional[ProductForecastDetailOut] = None
