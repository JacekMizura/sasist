"""Modele API: auto-reorder (reguły, historia, uruchomienie)."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class PurchaseAutoReorderKpisOut(BaseModel):
    """Karty KPI na stronie automatycznych zamówień."""

    active_rules: int
    last_run_finished_at: Optional[str] = None
    drafts_created_today: int
    time_saved_minutes_heuristic: int


class PurchaseAutoRuleCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    name: str = Field(..., min_length=1, max_length=256)
    is_enabled: bool = True
    run_time: str = Field(default="07:00", max_length=8)
    weekdays_json: str = Field(default="[1,2,3,4,5]", description="JSON: numery dni 1=pon … 7=nd")
    config_json: str = Field(default="{}", description="Filtry silnika (budżet, MOV, …)")


class PurchaseAutoRulePatchBody(BaseModel):
    name: Optional[str] = Field(None, max_length=256)
    is_enabled: Optional[bool] = None
    run_time: Optional[str] = Field(None, max_length=8)
    weekdays_json: Optional[str] = None
    config_json: Optional[str] = None


class PurchaseAutoRuleOut(BaseModel):
    id: int
    tenant_id: int
    name: str
    is_enabled: bool
    run_time: str
    weekdays_json: str
    config_json: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PurchaseAutoRunOut(BaseModel):
    id: int
    tenant_id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    created_orders_count: int
    skipped_products_count: int
    log_json: Optional[str] = None

    model_config = {"from_attributes": True}


class PurchaseAutoReorderHistoryOut(BaseModel):
    kpis: PurchaseAutoReorderKpisOut
    runs: List[PurchaseAutoRunOut]


class PurchaseAutoReorderPreviewRowOut(BaseModel):
    product_id: int
    name: Optional[str] = None
    sku: Optional[str] = None
    supplier_name: Optional[str] = None
    suggested_qty: float
    estimated_order_value: Optional[float] = None


class PurchaseAutoReorderPreviewOut(BaseModel):
    rule_id: int
    rule_name: str
    count: int
    rows: List[PurchaseAutoReorderPreviewRowOut]
    meta: Dict[str, Any] = Field(default_factory=dict)


class PurchaseAutoReorderRunResultOut(BaseModel):
    run_id: int
    status: str
    created_orders_count: int
    skipped_products_count: int
    purchase_order_ids: List[int] = Field(default_factory=list)
    dry_run: bool = False
    preview_rows: List[Any] = Field(default_factory=list)


class PurchaseAutoReorderRunNowBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    rule_id: Optional[int] = Field(None, ge=1, description="Puste = wszystkie włączone reguły po kolei.")
    dry_run: bool = Field(default=False, description="True: tylko podgląd, bez tworzenia PO.")


class PurchaseAutoReorderRunResponseOut(BaseModel):
    """Odpowiedź uruchomienia: jedna lub wiele reguł (pole batch)."""

    batch: bool
    results: List[PurchaseAutoReorderRunResultOut]
