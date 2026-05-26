"""Response models for purchasing cooperation-history analytics."""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel


class CooperationHistorySummaryOut(BaseModel):
    supplier_id: int
    supplier_name: str
    total_orders: int = 0
    total_receipts: int = 0
    first_order_date: Optional[str] = None
    last_delivery_date: Optional[str] = None
    avg_delivery_time: Optional[float] = None
    on_time_percent: Optional[float] = None
    total_net_spend: float = 0.0
    price_trend: Optional[float] = None


class CooperationHistoryDocRowOut(BaseModel):
    doc_type: str
    document_no: str
    date: Optional[str] = None
    status: Optional[str] = None
    supplier_name: str
    total_net: Optional[float] = None
    total_gross: Optional[float] = None


class PurchasingCooperationHistoryOut(BaseModel):
    summary: CooperationHistorySummaryOut
    recent_documents: List[CooperationHistoryDocRowOut]
