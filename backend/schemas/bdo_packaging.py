"""Pydantic — moduł BDO (odniesienia do materiałów magazynowych)."""

from __future__ import annotations

from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator

BdoWmKind = Literal["packaging", "carton"]
BdoCorrectionReason = Literal["damage", "disposal", "returned_supplier", "internal_usage", "opening_balance"]


def _norm_wm_ref(v: str) -> str:
    s = (v or "").strip()
    if ":" not in s:
        raise ValueError("wm_ref")
    kind, wid = s.split(":", 1)
    k = kind.strip().lower()
    if k not in ("packaging", "carton"):
        raise ValueError("wm_ref kind")
    rid = wid.strip()
    if not rid:
        raise ValueError("wm_ref id")
    return f"{k}:{rid}"


class BdoWmCatalogRow(BaseModel):
    """Jedna pozycja z asortymentu (Materiały magazynowe) + pola BDO."""

    wm_ref: str
    kind: BdoWmKind
    warehouse_id: int
    name: str
    sku: Optional[str] = None
    category: str = ""
    unit: str
    stock: float = 0.0
    is_active: bool = True
    include_in_bdo: bool = False
    packaging_type: Optional[str] = None
    plastic_kg_per_unit: float = 0.0
    paper_kg_per_unit: float = 0.0
    wood_kg_per_unit: float = 0.0
    glass_kg_per_unit: float = 0.0
    metal_kg_per_unit: float = 0.0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BdoWmBdoFieldsPatch(BaseModel):
    wm_ref: str = Field(..., min_length=5, max_length=64)
    plastic_kg_per_unit: Optional[float] = None
    paper_kg_per_unit: Optional[float] = None
    wood_kg_per_unit: Optional[float] = None
    glass_kg_per_unit: Optional[float] = None
    metal_kg_per_unit: Optional[float] = None
    packaging_type: Optional[str] = Field(None, max_length=64)
    include_in_bdo: Optional[bool] = None

    @field_validator("wm_ref")
    @classmethod
    def _wm_ref(cls, v: str) -> str:
        return _norm_wm_ref(v)


class BdoPurchaseCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    wm_ref: str = Field(..., min_length=5, max_length=64)
    purchase_date: date
    supplier_name: str = Field(default="", max_length=512)
    qty: float = Field(..., gt=0)
    unit_cost: Optional[float] = None
    total: Optional[float] = None
    document_no: Optional[str] = Field(None, max_length=256)
    notes: Optional[str] = None

    @field_validator("wm_ref")
    @classmethod
    def _wm_ref(cls, v: str) -> str:
        return _norm_wm_ref(v)


class BdoPurchaseRead(BaseModel):
    id: int
    tenant_id: int
    wm_ref: str
    material_name: str = ""
    purchase_date: date
    supplier_name: str
    qty: float
    unit_cost: Optional[float] = None
    total: Optional[float] = None
    document_no: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BdoStockCountLineIn(BaseModel):
    wm_ref: str = Field(..., min_length=5, max_length=64)
    counted_stock: float
    notes: Optional[str] = None

    @field_validator("wm_ref")
    @classmethod
    def _wm_ref(cls, v: str) -> str:
        return _norm_wm_ref(v)


class BdoStockCountCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    count_date: date
    period_label: Optional[str] = Field(None, max_length=32)
    notes: Optional[str] = None
    created_by_label: Optional[str] = Field(None, max_length=256)
    lines: List[BdoStockCountLineIn] = Field(default_factory=list)


class BdoStockCountLineRead(BaseModel):
    wm_ref: str
    material_name: str = ""
    system_stock: float
    counted_stock: float
    difference: float
    notes: Optional[str] = None


class BdoStockCountRead(BaseModel):
    id: int
    tenant_id: int
    count_date: date
    period_label: Optional[str] = None
    notes: Optional[str] = None
    created_by_label: Optional[str] = None
    created_at: Optional[datetime] = None
    lines: List[BdoStockCountLineRead] = Field(default_factory=list)


class BdoCorrectionCreate(BaseModel):
    tenant_id: int = Field(..., ge=1)
    wm_ref: str = Field(..., min_length=5, max_length=64)
    correction_date: date
    qty: float = Field(..., description="Dodatnie zwiększa stan, ujemne zmniejsza")
    reason: BdoCorrectionReason
    notes: Optional[str] = None

    @field_validator("wm_ref")
    @classmethod
    def _wm_ref(cls, v: str) -> str:
        return _norm_wm_ref(v)


class BdoCorrectionRead(BaseModel):
    id: int
    tenant_id: int
    wm_ref: str
    material_name: str = ""
    correction_date: date
    qty: float
    reason: str
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BdoSettingsRead(BaseModel):
    tenant_id: int
    reporting_company_name: Optional[str] = None
    registration_numbers: Optional[str] = None
    default_methodology_text: Optional[str] = None
    allow_negative_stock: bool = False
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BdoSettingsUpdate(BaseModel):
    reporting_company_name: Optional[str] = Field(None, max_length=512)
    registration_numbers: Optional[str] = None
    default_methodology_text: Optional[str] = None
    allow_negative_stock: Optional[bool] = None


class BdoMovementRead(BaseModel):
    """Zdarzenie operacyjne BDO (zakup ręczny, korekta, spis) — jedna lista historii."""

    id: str
    occurred_at: datetime
    movement_type: str
    wm_ref: Optional[str] = None
    material_name: str = ""
    qty: Optional[float] = None
    amount_pln: Optional[float] = None
    reference: Optional[str] = None
    notes: Optional[str] = None


class BdoDashboardRead(BaseModel):
    materials_tracked: int
    estimated_plastic_kg: float
    estimated_paper_kg: float
    month_purchases_pln: float
    last_report_month_label: Optional[str] = None
    missing_stock_counts: int
    ledger_plastic_kg: float
    ledger_paper_kg: float


class BdoAuditRead(BaseModel):
    id: int
    created_at: Optional[datetime] = None
    action: str
    detail: Optional[str] = None
    user_label: Optional[str] = None

    class Config:
        from_attributes = True


class BdoMonthlyReportRow(BaseModel):
    wm_ref: str
    material_name: str
    sku: Optional[str] = None
    beginning_qty: float
    purchased_qty: float
    corrections_qty: float
    ending_qty: Optional[float] = None
    used_qty: Optional[float] = None
    plastic_kg: float
    paper_kg: float
    wood_kg: float
    glass_kg: float
    metal_kg: float


class BdoMonthlyReportRead(BaseModel):
    year: int
    month: int
    methodology_note: Optional[str] = None
    totals_plastic_kg: float
    totals_paper_kg: float
    totals_wood_kg: float
    totals_glass_kg: float
    totals_metal_kg: float
    rows: List[BdoMonthlyReportRow] = Field(default_factory=list)
