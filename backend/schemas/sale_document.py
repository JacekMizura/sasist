"""Sale document list + detail DTOs."""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, Field


class SaleDocumentListItem(BaseModel):
    id: str
    order_id: int
    order_number: Optional[str] = None
    client: str
    series: str
    doc_type: str
    document_number: str
    date: Optional[str] = None
    net: float
    gross: float
    vat: float = 0.0
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None
    paid: bool = False
    external_status: str = "NOWE"
    source: Optional[str] = None
    panel_document_type: str
    document_subtype: Optional[str] = None
    detail_path: str


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


class SaleDocumentDetailRead(BaseModel):
    id: str
    document_number: str
    document_type_id: str
    document_series_id: str
    document_subtype: str
    panel_document_type: str
    doc_type: str
    series_type: str
    order_id: int
    order_number: str
    tenant_id: int
    warehouse_id: int
    warehouse_name: Optional[str] = None
    source: Optional[str] = None
    order_channel: Optional[str] = None
    created_at: Optional[str] = None
    currency: str
    total_net: float
    total_gross: float
    total_vat: float
    lines: list[SaleDocumentLineRead]
    vat_rows: list[SaleDocumentVatRowRead]
    buyer: SaleDocumentPartyRead
    seller: SaleDocumentPartyRead
    payment: SaleDocumentPaymentRead
    series: dict[str, Any]
    warehouse_effects: dict[str, Any]
    history: list[dict[str, Any]]
    print: dict[str, Any]
    export: dict[str, Any]
