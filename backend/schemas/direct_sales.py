"""Direct sales / operational sales API schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from ..api.contracts.direct_sales.add_product_request import AddDirectSalesProductRequest
from ..api.contracts.direct_sales.set_customer_request import SetDirectSalesCustomerRequest
from .commerce_enums import (
    DirectSaleSessionStatus,
    FulfillmentMode,
    IssueStrategy,
    OrderChannel,
    ReservationScope,
)


class DirectSaleSessionLineRead(BaseModel):
    id: int
    product_id: int
    quantity: float
    unit_price: float | None = None
    line_discount_type: str | None = None
    line_discount_value: float = 0.0
    discount_amount: float = 0.0
    line_gross: float | None = None
    line_net: float | None = None
    source_location_id: int | None = None
    suggested_location_id: int | None = None
    sort_order: int = 0
    product_name: str | None = None
    product_sku: str | None = None
    product_ean: str | None = None
    product_catalog_number: str | None = None
    margin_percent: float | None = None
    image_url: str | None = None
    source_location_code: str | None = None
    operational_zone_type: str | None = None
    available_qty_hint: float | None = None
    has_reservation: bool = False


class DirectSaleProductSearchHit(BaseModel):
    offer_id: int | None = None
    product_id: int
    name: str
    stock_disposition: str | None = None
    sku: str | None = None
    ean: str | None = None
    catalog_number: str | None = None
    image_url: str | None = None
    unit_price: float | None = None
    available_qty: float = 0.0
    preferred_location_id: int | None = None
    preferred_location_code: str | None = None
    operational_zone_type: str | None = None


DirectSaleAddProductBody = AddDirectSalesProductRequest


class DirectSaleLinePatchBody(BaseModel):
    quantity: float | None = Field(None, gt=0)
    source_location_id: int | None = None
    line_discount_type: str | None = Field(None, description="percent | amount")
    line_discount_value: float | None = Field(None, ge=0)


class DirectSaleSessionDiscountPatchBody(BaseModel):
    order_discount_type: str | None = Field(None, description="percent | amount")
    order_discount_value: float = Field(0.0, ge=0)


class DirectSaleDocumentPatchBody(BaseModel):
    document_subtype: str = Field(..., description="RECEIPT | INVOICE")


class DirectSaleSessionTotalsRead(BaseModel):
    subtotal_gross: float
    line_discounts_gross: float
    lines_gross: float
    order_discount_gross: float
    total_discount_gross: float
    total_net: float
    total_vat: float
    total_gross: float


class DirectSaleNipLookupRead(BaseModel):
    ok: bool
    nip: str | None = None
    company_name: str | None = None
    street: str | None = None
    postal_code: str | None = None
    city: str | None = None
    source: str | None = None
    error: str | None = None
    customer_id: int | None = None


class DirectSaleInvoiceCustomerBody(BaseModel):
    nip: str = Field(..., min_length=10, max_length=16)
    company_name: str = Field(..., min_length=1, max_length=256)
    street: str | None = Field(None, max_length=256)
    postal_code: str | None = Field(None, max_length=32)
    city: str | None = Field(None, max_length=128)


class DirectSaleSessionRead(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    operator_user_id: int | None = None
    workstation_id: int | None = None
    operational_zone_id: int | None = None
    status: DirectSaleSessionStatus
    order_id: int | None = None
    issue_strategy: IssueStrategy = "STRICT_LOCATION"
    reservation_scope: ReservationScope = "SESSION"
    started_at: datetime | None = None
    suspended_at: datetime | None = None
    last_activity_at: datetime | None = None
    completed_at: datetime | None = None
    customer_id: int | None = None
    customer_is_retail: bool = False
    document_subtype: str = "RECEIPT"
    order_discount_type: str | None = None
    order_discount_value: float = 0.0
    expires_at: datetime | None = None
    payment_context: dict | None = None
    totals: DirectSaleSessionTotalsRead | None = None
    lines: list[DirectSaleSessionLineRead] = Field(default_factory=list)


class DirectSaleSessionCreateBody(BaseModel):
    workstation_id: int | None = None
    operational_zone_id: int | None = None
    issue_strategy: IssueStrategy = "STRICT_LOCATION"
    reservation_scope: ReservationScope = "SESSION"


class DirectSaleScanBody(BaseModel):
    code: str = Field(..., min_length=1, description="EAN / SKU / internal scan")
    quantity: float = Field(1.0, gt=0)
    source_location_id: int | None = None
    offer_id: int | None = Field(default=None, ge=1, description="Required when product has multiple offers")


class DirectSaleScanResponse(BaseModel):
    session_id: int
    line_id: int
    product_id: int
    quantity: float
    suggested_locations: list[dict] = Field(default_factory=list)


DirectSaleSetCustomerBody = SetDirectSalesCustomerRequest


class DirectSaleStartPaymentBody(BaseModel):
    payment_method: str = Field("CASH", max_length=24)


class DirectSalePaymentSplit(BaseModel):
    method: str = Field(..., max_length=24)
    amount: float = Field(..., gt=0)


class DirectSaleCompleteBody(BaseModel):
    payment_method: str = Field("CASH", max_length=24)
    document_subtype: str = Field("RECEIPT", description="RECEIPT or INVOICE")
    payment_splits: list[DirectSalePaymentSplit] | None = None


class DirectSalePaymentTransactionRead(BaseModel):
    id: int
    method: str
    amount: float
    status: str
    external_ref: str | None = None


class DirectSalePaymentDetailRead(BaseModel):
    payment_id: int | None = None
    method: str | None = None
    status: str | None = None
    amount: float | None = None
    authorization_reference: str | None = None
    external_transaction_id: str | None = None
    settlement_state: str | None = None
    transactions: list[DirectSalePaymentTransactionRead] = Field(default_factory=list)


class DirectSaleDocumentDetailRead(BaseModel):
    job_id: int | None = None
    document_number: str | None = None
    document_subtype: str | None = None
    status: str | None = None
    status_label: str | None = None
    fiscal_status: str | None = None
    sale_document_id: str | None = None
    error_message: str | None = None


class DirectSaleLineTraceRead(BaseModel):
    product_id: int
    product_name: str | None = None
    sku: str | None = None
    source_location_code: str | None = None
    issued_qty: float = 0.0
    movement_id: int | None = None
    reservation_id: int | None = None
    stock_before: float | None = None
    stock_after: float | None = None
    issued_at: str | None = None


class DirectSaleStockDeltaRead(BaseModel):
    location_code: str
    product_name: str
    qty_issued: float
    stock_before: float | None = None
    stock_after: float | None = None


class DirectSaleTimelineEventRead(BaseModel):
    at: str | None = None
    kind: str
    label: str
    detail: str | None = None


class DirectSaleCompletionRead(BaseModel):
    session_id: int
    order_id: int
    order_number: str | None = None
    payment_id: int | None = None
    document_job_id: int | None = None
    document_number: str | None = None
    document_subtype: str | None = None
    total_amount: float = 0.0
    payment_status: str | None = None
    payment_method: str | None = None
    completed_at: str | None = None
    operator_label: str | None = None
    warehouse_id: int | None = None
    lines: list[DirectSaleLineTraceRead] = Field(default_factory=list)
    stock_deltas: list[DirectSaleStockDeltaRead] = Field(default_factory=list)
    timeline: list[DirectSaleTimelineEventRead] = Field(default_factory=list)
    payment: DirectSalePaymentDetailRead | None = None
    document: DirectSaleDocumentDetailRead | None = None


class DirectSaleCompleteResponse(BaseModel):
    session_id: int
    order_id: int
    payment_id: int
    document_job_id: int | None = None
    document_number: str | None = None
    total_amount: float
    payment_status: str | None = None
    payment_method: str | None = None
    completion: DirectSaleCompletionRead | None = None


class DirectSaleHistoryEntryRead(BaseModel):
    session_id: int
    order_id: int | None = None
    order_number: str | None = None
    operator_user_id: int | None = None
    operator_label: str | None = None
    workstation_id: int | None = None
    total_amount: float = 0.0
    payment_method: str | None = None
    payment_status: str | None = None
    document_number: str | None = None
    document_subtype: str | None = None
    document_status: str | None = None
    status: str
    completed_at: str | None = None


class DirectSaleSuspendedSummaryRead(BaseModel):
    id: int
    operator_user_id: int | None = None
    operator_label: str | None = None
    line_count: int = 0
    total_amount: float = 0.0
    suspended_at: datetime | None = None
    started_at: datetime | None = None
    age_minutes: int | None = None
