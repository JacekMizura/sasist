"""Unified sale document DTOs — list and detail share the same financial/payment core."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class SaleDocumentFinancialsRead(BaseModel):
    total_net: float
    total_gross: float
    total_vat: float
    lines: list[dict[str, Any]] = Field(default_factory=list)
    vat_rows: list[dict[str, Any]] = Field(default_factory=list)


class SaleDocumentPaymentTransactionRead(BaseModel):
    id: int
    method: str
    amount: float
    status: str
    external_ref: Optional[str] = None
    created_at: Optional[str] = None


class SaleDocumentPaymentRead(BaseModel):
    payment_id: Optional[int] = None
    method: Optional[str] = None
    status: Optional[str] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    payment_label_pl: str = "—"
    paid: bool = False
    amount: float = 0.0
    currency: str = "PLN"
    captured_at: Optional[str] = None
    external_transaction_id: Optional[str] = None
    authorization_reference: Optional[str] = None
    transactions: list[SaleDocumentPaymentTransactionRead] = Field(default_factory=list)


class SaleDocumentPartyRead(BaseModel):
    id: Optional[int] = None
    name: str
    nip: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    zip: Optional[str] = None
    country: Optional[str] = None
    bank: Optional[str] = None
    iban: Optional[str] = None


class SaleDocumentLineRead(BaseModel):
    order_item_id: int
    product_id: int
    name: str
    sku: Optional[str] = None
    quantity: int
    unit_net: Optional[float] = None
    unit_gross: Optional[float] = None
    vat_percent: float
    line_net: float
    line_vat: float
    line_gross: float


class SaleDocumentVatRowRead(BaseModel):
    vat_percent: float
    net: float
    vat: float
    gross: float


class SaleDocumentBaseRead(BaseModel):
    """Shared core for list, detail, and Direct Sales summary embedding."""

    id: str
    order_id: int
    order_number: str
    tenant_id: int
    warehouse_id: int
    document_series_id: str
    document_type_id: str
    document_subtype: str
    panel_document_type: str
    doc_type: str
    series_type: str
    series: str
    client: str
    source: Optional[str] = None
    order_channel: Optional[str] = None
    created_at: Optional[str] = None
    date: Optional[str] = None
    currency: str = "PLN"
    document_number: str
    document_number_raw: str
    numbering_status: str
    numbering_legacy: bool = False
    financials: SaleDocumentFinancialsRead
    total_net: float
    total_gross: float
    total_vat: float
    net: float
    gross: float
    vat: float
    payment: SaleDocumentPaymentRead
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    payment_label_pl: str = "—"
    paid: bool = False
    external_status: str = "NOWE"
    detail_path: str


class SaleDocumentListItemRead(SaleDocumentBaseRead):
    pass


class SaleDocumentDetailRead(SaleDocumentBaseRead):
    warehouse_name: Optional[str] = None
    lines: list[SaleDocumentLineRead]
    vat_rows: list[SaleDocumentVatRowRead]
    buyer: SaleDocumentPartyRead
    seller: SaleDocumentPartyRead
    series_meta: dict[str, Any]
    warehouse_effects: dict[str, Any]
    related: dict[str, Any]
    history: list[dict[str, Any]]
    print: dict[str, Any]
    export: dict[str, Any]
    status_badges: dict[str, Any]
