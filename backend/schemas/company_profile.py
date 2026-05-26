from __future__ import annotations

from pydantic import BaseModel


class CompanyProfileRead(BaseModel):
    tenant_id: int
    company_name: str | None = None
    street: str | None = None
    building_number: str | None = None
    apartment_number: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str | None = None
    nip: str | None = None
    regon: str | None = None
    address_extra_line: str | None = None
    bank_name: str | None = None
    iban: str | None = None
    bic_swift: str | None = None
    document_email: str | None = None
    company_phone: str | None = None
    website_url: str | None = None
    logo_url: str | None = None

    class Config:
        from_attributes = True


class CompanyProfileUpdate(BaseModel):
    company_name: str | None = None
    street: str | None = None
    building_number: str | None = None
    apartment_number: str | None = None
    postal_code: str | None = None
    city: str | None = None
    country: str | None = None
    nip: str | None = None
    regon: str | None = None
    address_extra_line: str | None = None
    bank_name: str | None = None
    iban: str | None = None
    bic_swift: str | None = None
    document_email: str | None = None
    company_phone: str | None = None
    website_url: str | None = None
