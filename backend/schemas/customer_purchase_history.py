"""Pydantic schemas for customer purchase history analytics."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class PurchaseHistoryStatusBadge(BaseModel):
    id: Optional[int] = None
    name: str
    color: str = "#64748b"
    main_group: str = "NEW"


class PurchaseHistoryProductPreview(BaseModel):
    product_id: Optional[int] = None
    name: str
    ean: Optional[str] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None
    quantity: int = 0


class PurchaseHistoryDocumentRow(BaseModel):
    lp: int
    order_id: int
    document_number: str
    order_date: Optional[str] = None
    status: PurchaseHistoryStatusBadge
    products_preview: List[PurchaseHistoryProductPreview] = Field(default_factory=list)
    line_count: int = 0
    net: float = 0.0
    vat: float = 0.0
    gross: float = 0.0
    warehouse_id: Optional[int] = None
    warehouse_name: Optional[str] = None
    operator_name: Optional[str] = None
    order_channel: str = "—"
    is_paid: bool = False
    detail_path: str


class PurchaseHistoryListOut(BaseModel):
    items: List[PurchaseHistoryDocumentRow] = Field(default_factory=list)
    total: int = 0
    page: int = 1
    page_size: int = 25
    pages: int = 1


class FilterOptionItem(BaseModel):
    id: int | str
    name: str


class PurchaseHistoryFilterOptions(BaseModel):
    warehouses: List[FilterOptionItem] = Field(default_factory=list)
    operators: List[FilterOptionItem] = Field(default_factory=list)
    statuses: List[FilterOptionItem] = Field(default_factory=list)
    channels: List[FilterOptionItem] = Field(default_factory=list)


class PurchaseHistorySummaryOut(BaseModel):
    total_gross: float = 0.0
    total_net: float = 0.0
    total_vat: float = 0.0
    order_count: int = 0
    avg_basket_gross: float = 0.0
    last_purchase_at: Optional[str] = None
    total_products_qty: int = 0
    returns_corrections_count: int = 0
    avg_days_between_orders: Optional[float] = None
    stats_computed_at: Optional[str] = None
    filter_options: PurchaseHistoryFilterOptions = Field(default_factory=PurchaseHistoryFilterOptions)


class TopProductRow(BaseModel):
    product_id: int
    name: str
    ean: Optional[str] = None
    sku: Optional[str] = None
    image_url: Optional[str] = None
    purchase_count: int = 0
    total_quantity: int = 0
    total_gross: float = 0.0
    last_purchased_at: Optional[str] = None
    detail_path: str


class TopProductsOut(BaseModel):
    items: List[TopProductRow] = Field(default_factory=list)


class TrendPoint(BaseModel):
    period: str
    gross: float = 0.0


class PurchaseTrendOut(BaseModel):
    granularity: str = "month"
    points: List[TrendPoint] = Field(default_factory=list)
