"""Pydantic schemas for document series (serie dokumentów)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator

DocumentSeriesType = Literal["SALE", "WAREHOUSE", "CORRECTION"]
DocumentSeriesSubtype = Literal[
    "INVOICE",
    "RECEIPT",
    "WZ",
    "PZ",
    "MM",
    "RW",
    "PW",
    "RESERVATION",
    "CORRECTION",
]
DeleteMode = Literal["ALWAYS_DELETE", "ASK"]
VatSource = Literal["FROM_ORDER", "FROM_LINES", "MANUAL", "FIXED"]
VatCalcLineMode = Literal["DEFAULT", "FROM_ORDER", "FROM_LINES", "EXCLUDE", "MANUAL"]
SaleDateSource = Literal["ORDER_DATE", "DOCUMENT_DATE", "DELIVERY_DATE", "MANUAL"]
CurrencySource = Literal["ORDER", "SERIES", "MANUAL"]


def _allowed_subtypes(series_type: str) -> set[str]:
    t = (series_type or "").strip().upper()
    if t == "SALE":
        return {"INVOICE", "RECEIPT"}
    if t == "WAREHOUSE":
        return {"WZ", "PZ", "MM", "RW", "PW", "RESERVATION"}
    if t == "CORRECTION":
        return {"CORRECTION"}
    return set()


class OrderUiStatusMiniOut(BaseModel):
    id: int
    name: str
    main_group: str


class DocumentSeriesBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=256)
    prefix: str = Field("", max_length=64)
    suffix: str = Field("", max_length=64)
    color: str = Field("#64748b", max_length=16)
    type: DocumentSeriesType
    subtype: DocumentSeriesSubtype
    correction_series_id: Optional[str] = Field(None, max_length=36)
    warehouse_document_series_id: Optional[str] = Field(
        None,
        max_length=36,
        description="Linked WZ series for SALE documents (Seria dokumentu magazynowego).",
    )
    print_template: str = Field("", max_length=512)
    print_template_id: Optional[int] = Field(None, ge=1, le=999999)
    email_notification_enabled: bool = False
    delete_mode: DeleteMode = "ASK"
    vat_source: Optional[VatSource] = None
    vat_calc_shipping: VatCalcLineMode = "DEFAULT"
    vat_calc_payment: VatCalcLineMode = "DEFAULT"
    vat_rate_percent: Optional[int] = Field(None, ge=0, le=100)
    sale_date_source: SaleDateSource = "ORDER_DATE"
    count_shipping_cost_always: bool = False
    shipping_cost_name: str = Field("Koszt wysyłki", max_length=128)
    payment_term_default: str = Field("", max_length=128)
    currency_source: CurrencySource = "ORDER"
    auto_currency_conversion: bool = False
    additional_fields_template: Optional[str] = None
    disable_customer_validation: bool = False
    allow_empty_customer: bool = False
    warehouse_effect: bool = False
    status_on_create_id: Optional[int] = Field(None, ge=1)
    status_on_delete_id: Optional[int] = Field(None, ge=1)
    status_on_error_id: Optional[int] = Field(None, ge=1)
    status_on_update_id: Optional[int] = Field(None, ge=1)
    numbering_start: int = Field(1, ge=1)
    numbering_format: str = Field("{PREFIX}{NUMBER}", max_length=256)
    reset_each_period: bool = False
    code: str = Field("", max_length=32)
    padding_length: int = Field(6, ge=1, le=12)
    yearly_reset: bool = False
    monthly_reset: bool = False
    is_default: bool = False
    is_active: bool = True
    notes: Optional[str] = None
    company_name: Optional[str] = Field(None, max_length=256)
    company_street: Optional[str] = Field(None, max_length=256)
    company_house_number: Optional[str] = Field(None, max_length=32)
    company_apartment_number: Optional[str] = Field(None, max_length=32)
    company_address: Optional[str] = Field(None, max_length=512)
    company_city: Optional[str] = Field(None, max_length=128)
    company_zip: Optional[str] = Field(None, max_length=32)
    company_country: Optional[str] = Field(None, max_length=128)
    company_nip: Optional[str] = Field(None, max_length=32)
    company_regon: Optional[str] = Field(None, max_length=32)
    company_bank: Optional[str] = Field(None, max_length=256)
    company_iban: Optional[str] = Field(None, max_length=64)
    company_bic: Optional[str] = Field(None, max_length=32)
    company_email: Optional[str] = Field(None, max_length=256)

    @field_validator("color")
    @classmethod
    def _color_hex(cls, v: str) -> str:
        s = (v or "").strip()
        if not s.startswith("#") or len(s) not in (4, 7):
            raise ValueError("color must be #RGB or #RRGGBB")
        return s

    @model_validator(mode="after")
    def _subtype_matches_type(self) -> "DocumentSeriesBase":
        allowed = _allowed_subtypes(self.type)
        st = str(self.subtype).strip().upper()
        if st not in allowed:
            raise ValueError(f"subtype {st!r} not allowed for type {self.type!r}")
        self.subtype = st  # type: ignore[assignment]
        return self


class DocumentSeriesCreate(DocumentSeriesBase):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)


class DocumentSeriesUpdate(DocumentSeriesBase):
    """Full PUT body — same fields as create except tenant/warehouse immutable via URL context."""


class DocumentSeriesRead(DocumentSeriesBase):
    id: str
    tenant_id: int
    warehouse_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    status_on_create: Optional[OrderUiStatusMiniOut] = None
    status_on_delete: Optional[OrderUiStatusMiniOut] = None
    status_on_error: Optional[OrderUiStatusMiniOut] = None
    status_on_update: Optional[OrderUiStatusMiniOut] = None

    class Config:
        from_attributes = True


class DocumentSeriesBulkDeleteBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: int = Field(..., ge=1)
    ids: List[str] = Field(..., min_length=1, description="document_series.id (UUID strings)")


class DocumentSeriesBulkDeleteOut(BaseModel):
    deleted: int


class OperationalDocumentSeriesOut(BaseModel):
    """One operational document type derived from an active default series."""

    series_id: str
    series_type: str
    subtype: str
    operational_code: str
    prefix: str
    label: str
    warehouse_effect: bool
    route_segment: Optional[str] = None
    list_path: Optional[str] = None
    stock_document_type: Optional[str] = None
    is_default: bool = True
    is_active: bool = True
    numbering_format: str = ""


class OperationalDocumentCatalogOut(BaseModel):
    tenant_id: int
    warehouse_id: int
    required_count: int
    configured_count: int
    missing_required_subtypes: List[str] = Field(default_factory=list)
    bootstrap_complete: bool
    items: List[OperationalDocumentSeriesOut] = Field(default_factory=list)
