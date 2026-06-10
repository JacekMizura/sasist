"""Schemas — klient z zamówienia."""

from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, Field


class CustomerDuplicateCandidateOut(BaseModel):
    id: int
    display_name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    nip: Optional[str] = None
    match_reasons: List[str] = Field(default_factory=list)


class OrderCustomerDraftOut(BaseModel):
    first_name: str
    last_name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    company_name: Optional[str] = None
    nip: Optional[str] = None
    country_code: str = "PL"
    default_document_type: str = "RECEIPT"
    addresses: List[dict[str, Any]] = Field(default_factory=list)


class OrderCustomerLinkPreviewOut(BaseModel):
    order_id: int
    customer_id: Optional[int] = None
    has_customer_data: bool = False
    draft: OrderCustomerDraftOut
    duplicates: List[CustomerDuplicateCandidateOut] = Field(default_factory=list)


class OrderCustomerCreateBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    order_id: int = Field(..., ge=1)
    force_duplicate: bool = False


class OrderCustomerLinkBody(BaseModel):
    tenant_id: int = Field(..., ge=1)
    order_id: int = Field(..., ge=1)
    customer_id: int = Field(..., ge=1)


class OrderCustomerLinkResultOut(BaseModel):
    order_id: int
    customer_id: int
    display_name: str
    duplicates_skipped: int = 0
