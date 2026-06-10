"""Pydantic schemas for customers (klenci)."""

from __future__ import annotations

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


DocumentTypePref = Literal["RECEIPT", "INVOICE"]
CustomerTypePref = Literal["retail", "wholesale", "company", "marketplace", "b2b"]
CustomerStatusPref = Literal["active", "blocked", "archived"]


class CustomerFlagsOut(BaseModel):
    vip: bool = False
    debtor: bool = False
    priority: bool = False
    suspicious: bool = False


class CustomerSummaryOut(BaseModel):
    order_count: int = 0
    total_gross: float = 0.0
    total_net: float = 0.0
    avg_basket_gross: float = 0.0
    last_order_at: Optional[datetime] = None
    returns_count: int = 0


class CustomerAddressBase(BaseModel):
    first_name: str = Field("", max_length=128)
    last_name: str = Field("", max_length=128)
    company_name: Optional[str] = Field(None, max_length=256)
    street: str = Field("", max_length=256)
    house_number: str = Field("", max_length=32)
    apartment_number: Optional[str] = Field(None, max_length=32)
    postal_code: str = Field("", max_length=32)
    city: str = Field("", max_length=128)
    country_code: str = Field("PL", max_length=8)
    is_default: bool = False


class CustomerAddressCreate(CustomerAddressBase):
    pass


class CustomerAddressOut(CustomerAddressBase):
    id: int
    customer_id: int

    class Config:
        from_attributes = True


class CustomerProductDiscountOut(BaseModel):
    id: int
    customer_id: int
    product_id: int
    discount_percent: float
    product_name: Optional[str] = None
    product_sku: Optional[str] = None

    class Config:
        from_attributes = True


class CustomerProductDiscountWrite(BaseModel):
    product_id: int = Field(..., ge=1)
    discount_percent: float = Field(0.0, ge=0.0, le=100.0)


class CustomerListOut(BaseModel):
    id: int
    tenant_id: int
    display_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    nip: Optional[str] = None
    country_code: str = "PL"
    customer_type: CustomerTypePref = "retail"
    customer_status: CustomerStatusPref = "active"
    flags: CustomerFlagsOut = Field(default_factory=CustomerFlagsOut)
    order_count: int = 0
    total_gross: float = 0.0

    class Config:
        from_attributes = True


class CustomerBase(BaseModel):
    first_name: str = Field("", max_length=128)
    last_name: str = Field("", max_length=128)
    phone: Optional[str] = Field(None, max_length=64)
    email: Optional[str] = Field(None, max_length=256)
    company_name: Optional[str] = Field(None, max_length=256)
    nip: Optional[str] = Field(None, max_length=32)
    country_code: str = Field("PL", max_length=8)
    default_document_type: DocumentTypePref = "RECEIPT"
    preferred_shipping_method_id: Optional[str] = Field(None, max_length=36)
    preferred_payment_method: Optional[str] = Field(None, max_length=128)
    global_discount_percent: float = Field(0.0, ge=0.0, le=100.0)
    customer_type: CustomerTypePref = "retail"
    customer_status: CustomerStatusPref = "active"
    flags: CustomerFlagsOut = Field(default_factory=CustomerFlagsOut)
    credit_limit_gross: Optional[float] = Field(None, ge=0)
    payment_terms_days: Optional[int] = Field(None, ge=0)
    account_manager_user_id: Optional[int] = Field(None, ge=1)

    @field_validator("default_document_type", mode="before")
    @classmethod
    def _norm_doc_type(cls, v):
        if v is None or str(v).strip() == "":
            return "RECEIPT"
        u = str(v).strip().upper()
        if u not in ("RECEIPT", "INVOICE"):
            raise ValueError("default_document_type must be RECEIPT or INVOICE")
        return u


class CustomerCreate(CustomerBase):
    tenant_id: int = Field(..., ge=1)
    addresses: List[CustomerAddressCreate] = Field(default_factory=list)
    product_discounts: List[CustomerProductDiscountWrite] = Field(default_factory=list)


class CustomerUpdate(BaseModel):
    first_name: Optional[str] = Field(None, max_length=128)
    last_name: Optional[str] = Field(None, max_length=128)
    phone: Optional[str] = None
    email: Optional[str] = None
    company_name: Optional[str] = None
    nip: Optional[str] = None
    country_code: Optional[str] = Field(None, max_length=8)
    default_document_type: Optional[DocumentTypePref] = None
    preferred_shipping_method_id: Optional[str] = Field(None, max_length=36)
    preferred_payment_method: Optional[str] = Field(None, max_length=128)
    global_discount_percent: Optional[float] = Field(None, ge=0.0, le=100.0)
    customer_type: Optional[CustomerTypePref] = None
    credit_limit_gross: Optional[float] = Field(None, ge=0)
    payment_terms_days: Optional[int] = Field(None, ge=0)
    account_manager_user_id: Optional[int] = Field(None, ge=1)
    addresses: Optional[List[CustomerAddressCreate]] = None
    product_discounts: Optional[List[CustomerProductDiscountWrite]] = None


class CustomerCrmPatchBody(BaseModel):
    customer_type: Optional[CustomerTypePref] = None
    customer_status: Optional[CustomerStatusPref] = None
    flags: Optional[CustomerFlagsOut] = None
    credit_limit_gross: Optional[float] = Field(None, ge=0)
    payment_terms_days: Optional[int] = Field(None, ge=0)
    account_manager_user_id: Optional[int] = Field(None, ge=1)


class CustomerCrmActionBody(BaseModel):
    action: Literal[
        "mark_vip",
        "unmark_vip",
        "mark_debtor",
        "unmark_debtor",
        "block",
        "unblock",
    ]


class CustomerDetailOut(CustomerBase):
    id: int
    tenant_id: int
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    summary: Optional[CustomerSummaryOut] = None
    addresses: List[CustomerAddressOut] = Field(default_factory=list)
    product_discounts: List[CustomerProductDiscountOut] = Field(default_factory=list)

    class Config:
        from_attributes = True


class CustomerBriefOut(BaseModel):
    id: int
    display_name: str

    class Config:
        from_attributes = True


class CustomerBulkDeleteBody(BaseModel):
    """POST /customers/bulk-delete — lista id w obrębie tenanta."""

    tenant_id: int = Field(..., ge=1)
    ids: List[int] = Field(..., min_length=1)
