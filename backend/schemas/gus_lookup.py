"""Schemas for GUS company lookup."""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class GusLookupRequest(BaseModel):
    nip: str = Field(..., min_length=10, max_length=20, description="Numer NIP (10 cyfr)")
    force_refresh: bool = Field(False, description="Pomiń cache (ręczne odświeżenie)")


class GusLookupResponse(BaseModel):
    ok: bool
    found: bool = False
    gus_verified: bool = False
    from_cache: bool = False
    nip: Optional[str] = None
    company_name: Optional[str] = None
    regon: Optional[str] = None
    street: Optional[str] = None
    house_number: Optional[str] = None
    apartment_number: Optional[str] = None
    postal_code: Optional[str] = None
    city: Optional[str] = None
    voivodeship: Optional[str] = None
    business_status: Optional[str] = None
    activity_start_date: Optional[str] = None
    entity_type: Optional[str] = None
    pkd: Optional[str] = None
    vat_active: Optional[bool] = None
    vat_ue: Optional[bool] = None
    vat_status: Optional[str] = None
    source: Optional[str] = None
    warning: Optional[str] = None
    error: Optional[str] = None
