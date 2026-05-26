"""Odpowiedź API segmentacji ABC/XYZ."""

from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field


class PurchasingSegmentsSummaryOut(BaseModel):
    total_products: int
    products_a_count: int = Field(description="Liczba produktów w klasie A (udział skumulowany do 80% obrotu).")
    ax_count: int
    high_risk_count: int = Field(description="Segmenty AZ lub CZ.")
    dead_stock_count: int = Field(description="Stan > 0 i brak sprzedaży w oknie.")
    segment_counts: Dict[str, int] = Field(default_factory=dict, description="Liczba SKU na segment (np. AX, BY).")


class PurchasingSegmentRowOut(BaseModel):
    product_id: int
    name: str
    sku: Optional[str] = None
    ean: Optional[str] = None
    supplier_name: str = ""
    stock: float
    stock_value: float
    sales_qty: float
    sales_value: float
    avg_daily_sales: float
    demand_stddev: Optional[float] = None
    coefficient_variation: Optional[float] = None
    abc_class: str
    xyz_class: str
    segment: str
    suggested_strategy: str
    reorder_priority: int


class PurchasingSegmentsOut(BaseModel):
    range_days: int
    summary: PurchasingSegmentsSummaryOut
    rows: List[PurchasingSegmentRowOut] = Field(default_factory=list)
