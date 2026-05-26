"""Purchase order API schemas."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class PurchaseOrderFromGeneratorBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    warehouse_id: Optional[int] = Field(None, ge=1)
    product_ids: List[int] = Field(..., min_length=1)
    override_qty_map: Optional[Dict[int, float]] = None

    @field_validator("override_qty_map", mode="before")
    @classmethod
    def coerce_qty_map_keys(cls, v: Any) -> Any:
        if v is None:
            return None
        if not isinstance(v, dict):
            return v
        out: Dict[int, float] = {}
        for k, val in v.items():
            out[int(k)] = float(val)
        return out


class PurchaseOrderLinePatch(BaseModel):
    id: int = Field(..., ge=1)
    qty: Optional[float] = None
    unit_price: Optional[float] = None
    received_qty: Optional[float] = None
    notes: Optional[str] = None


class PurchaseOrderPatchBody(BaseModel):
    notes: Optional[str] = None
    expected_date: Optional[datetime] = None
    shipping_cost: Optional[float] = None
    currency: Optional[str] = Field(None, max_length=8)
    invoice_date: Optional[date] = Field(None, description="Data faktury / kursu (opcjonalnie; domyślnie data zamówienia).")
    tax_mode: Optional[str] = Field(None, max_length=48, description="domestic_vat | intra_eu_reverse_charge")
    line_updates: Optional[List[PurchaseOrderLinePatch]] = None

    @field_validator("tax_mode")
    @classmethod
    def validate_tax_mode(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        s = str(v).strip()
        if s not in ("domestic_vat", "intra_eu_reverse_charge"):
            raise ValueError("Invalid tax_mode")
        return s


class PurchaseOrderStatusBody(BaseModel):
    status: str = Field(..., max_length=32)


class PurchaseOrderLineOut(BaseModel):
    id: int
    purchase_order_id: int
    product_id: int
    product_name: Optional[str] = None
    sku: Optional[str] = None
    qty: float
    received_qty: float
    unit_price: Optional[float] = None
    line_total: float
    notes: Optional[str] = None
    ean: Optional[str] = None
    image_url: Optional[str] = None
    current_stock: Optional[float] = None
    sales_30d: Optional[float] = None
    suggested_qty: Optional[float] = None
    sell_price: Optional[float] = None
    supplier_name: Optional[str] = None
    lead_time_days: Optional[int] = None


class SupplierSnapshotOut(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    default_currency: Optional[str] = None
    minimum_order_qty: Optional[int] = None
    minimum_order_value: Optional[float] = None
    free_shipping_threshold: Optional[float] = None
    offers_free_shipping: bool = True
    requires_moq: bool = True
    lead_time_days: Optional[int] = None


class PurchaseOrderListRowOut(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: Optional[int] = None
    supplier_id: int
    supplier_name: str
    order_number: str
    status: str
    currency: str
    tax_mode: str = "domestic_vat"
    subtotal: float
    shipping_cost: float
    total_value: float
    item_count: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    expected_date: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    closed_at: Optional[datetime] = None


class PurchaseOrderDetailOut(PurchaseOrderListRowOut):
    supplier: Optional[SupplierSnapshotOut] = None
    notes: Optional[str] = None
    items: List[PurchaseOrderLineOut] = Field(default_factory=list)
    inbound_delivery_id: Optional[int] = None
    invoice_date: Optional[str] = Field(None, description="ISO date (YYYY-MM-DD) when set.")
    supplier_invoice_vat_rate_percent: float = 23.0
    fx_basis_date: Optional[str] = None
    fx_rate_to_pln: Optional[float] = None
    fx_rate_effective_date: Optional[str] = None
    fx_source_used: Optional[str] = None
    document_net: Optional[float] = None
    document_vat_supplier: Optional[float] = None
    document_gross: Optional[float] = None
    pln_net_total_sim: Optional[float] = None
    pln_vat_23_sim: Optional[float] = None
    pln_gross_sim: Optional[float] = None


class CreatedOrderBundleOut(BaseModel):
    order: PurchaseOrderDetailOut
    warnings: List[str] = Field(default_factory=list)


class PurchaseOrdersFromGeneratorOut(BaseModel):
    created_orders: List[CreatedOrderBundleOut]
    skipped_product_ids: List[int] = Field(default_factory=list)
    # Ile pozycji odrzucono wyłącznie z powodu braku supplier_id w wierszu uzupełnień.
    skipped_no_supplier_count: int = 0


class PurchaseOrderListOut(BaseModel):
    rows: List[PurchaseOrderListRowOut]
    total: int
    page: int
    page_size: int


class InboundDeliveryFromPoOut(BaseModel):
    delivery_id: int
    tenant_id: int
